import type { D1Database } from './env';
import { randomId, sha256Hex } from './crypto';
import type { SubscriptionRow } from './entitlement';

export interface UserRow {
  id: string;
  google_sub: string;
  name: string | null;
  stripe_customer_id: string | null;
}
export const SESSION_SECONDS = 30 * 24 * 3600;
export const nowSec = (): number => Math.floor(Date.now() / 1000);

export async function upsertGoogleUser(db: D1Database, sub: string, name: string | null): Promise<UserRow> {
  const now = nowSec();
  const existing = await db.prepare('SELECT id, google_sub, name, stripe_customer_id FROM users WHERE google_sub = ?').bind(sub).first<UserRow>();
  if (existing) {
    await db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').bind(name, now, existing.id).run();
    return { ...existing, name };
  }
  const id = randomId();
  await db.prepare('INSERT INTO users (id, google_sub, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, sub, name, now, now).run();
  return { id, google_sub: sub, name, stripe_customer_id: null };
}

export async function createSession(db: D1Database, token: string, userId: string): Promise<void> {
  const now = nowSec();
  await db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), userId, now, now + SESSION_SECONDS).run();
  // housekeeping: forget expired sessions
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
}

export async function userForSession(db: D1Database, token: string | undefined): Promise<UserRow | null> {
  if (!token) return null;
  return db
    .prepare('SELECT u.id, u.google_sub, u.name, u.stripe_customer_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?')
    .bind(await sha256Hex(token), nowSec())
    .first<UserRow>();
}

export async function deleteSession(db: D1Database, token: string | undefined): Promise<void> {
  if (token) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
}

// ---- Stripe objects are kept PER MODE (live key / test key): see migrations/0002_stripe_modes.sql ----
type Mode = 0 | 1;
const MODE_TABLES = [
  `CREATE TABLE IF NOT EXISTS stripe_customers (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, livemode INTEGER NOT NULL CHECK (livemode IN (0, 1)), customer_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, livemode))`,
  `CREATE TABLE IF NOT EXISTS stripe_subscriptions (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, livemode INTEGER NOT NULL CHECK (livemode IN (0, 1)), stripe_subscription_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, current_period_end INTEGER, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, livemode))`,
];
const tablesReady = new WeakMap<object, Promise<void>>();
/** Creates the two (empty) per-mode tables if the migration has not been applied yet. Nothing existing is touched. */
export function ensureModeTables(db: D1Database): Promise<void> {
  let p = tablesReady.get(db);
  if (!p) {
    p = (async () => { for (const q of MODE_TABLES) await db.prepare(q).run(); })().catch((e) => { tablesReady.delete(db); throw e; });
    tablesReady.set(db, p);
  }
  return p;
}

export async function getStripeCustomer(db: D1Database, userId: string, livemode: Mode): Promise<string | null> {
  await ensureModeTables(db);
  return (await db.prepare('SELECT customer_id FROM stripe_customers WHERE user_id = ? AND livemode = ?').bind(userId, livemode).first<{ customer_id: string }>())?.customer_id ?? null;
}
/** Remembers a customer for (account, mode). An existing entry is never replaced; a customer id belongs to one account only. */
export async function putStripeCustomer(db: D1Database, userId: string, livemode: Mode, customerId: string): Promise<boolean> {
  await ensureModeTables(db);
  const r = await db.prepare('INSERT OR IGNORE INTO stripe_customers (user_id, livemode, customer_id, created_at) VALUES (?, ?, ?, ?)').bind(userId, livemode, customerId, nowSec()).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function getSubscription(db: D1Database, userId: string, livemode: Mode) {
  await ensureModeTables(db);
  return db.prepare('SELECT stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at FROM stripe_subscriptions WHERE user_id = ? AND livemode = ?')
    .bind(userId, livemode).first<SubscriptionRow & { stripe_subscription_id: string; updated_at: number }>();
}
/** The row the OLD single-mode table holds for the account (mode unknown): only ever read, to be checked against Stripe and copied. */
export const getLegacySubscription = (db: D1Database, userId: string) =>
  db.prepare('SELECT stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at FROM subscriptions WHERE user_id = ?')
    .bind(userId).first<SubscriptionRow & { stripe_subscription_id: string; updated_at: number }>();

/** Copies the old table's row into the per-mode table under `livemode` (when it was found to belong to that mode). The old row stays. */
export async function copyLegacySubscription(db: D1Database, userId: string, livemode: Mode): Promise<void> {
  await ensureModeTables(db);
  await db.prepare('INSERT OR IGNORE INTO stripe_subscriptions (user_id, livemode, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at) SELECT user_id, ?, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at FROM subscriptions WHERE user_id = ?').bind(livemode, userId).run();
}

/** The account that owns a customer id: from the per-mode table, else (not classified yet) from the old column. */
export async function userByCustomer(db: D1Database, customerId: string): Promise<UserRow | null> {
  await ensureModeTables(db);
  return (
    (await db.prepare('SELECT u.id, u.google_sub, u.name, u.stripe_customer_id FROM stripe_customers c JOIN users u ON u.id = c.user_id WHERE c.customer_id = ?').bind(customerId).first<UserRow>()) ??
    (await db.prepare('SELECT id, google_sub, name, stripe_customer_id FROM users WHERE stripe_customer_id = ?').bind(customerId).first<UserRow>())
  );
}
export const userById = (db: D1Database, id: string) =>
  db.prepare('SELECT id, google_sub, name, stripe_customer_id FROM users WHERE id = ?').bind(id).first<UserRow>();

export interface SubscriptionInput {
  stripe_subscription_id: string;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
}
/**
 * One contract per account. A different subscription never replaces one that still gives access (a second payment by
 * mistake must not hide the first); returns false when it was not saved for that reason.
 */
export async function saveSubscription(db: D1Database, userId: string, livemode: Mode, s: SubscriptionInput, hasAccess: (row: SubscriptionRow) => boolean): Promise<boolean> {
  const current = await getSubscription(db, userId, livemode);
  if (current && current.stripe_subscription_id !== s.stripe_subscription_id && hasAccess(current)) return false;
  await db
    .prepare(
      `INSERT INTO stripe_subscriptions (user_id, livemode, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, livemode) DO UPDATE SET stripe_subscription_id = excluded.stripe_subscription_id, status = excluded.status,
         current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at`,
    )
    .bind(userId, livemode, s.stripe_subscription_id, s.status, s.current_period_end, s.cancel_at_period_end ? 1 : 0, nowSec())
    .run();
  return true;
}

/** Removes the account's own data. The Stripe customer record itself stays with Stripe (billing records). */
export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  await ensureModeTables(db);
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM stripe_subscriptions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM stripe_customers WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
}

export async function eventSeen(db: D1Database, eventId: string): Promise<boolean> {
  return !!(await db.prepare('SELECT event_id FROM stripe_events WHERE event_id = ?').bind(eventId).first());
}
export const markEvent = (db: D1Database, eventId: string, type: string) =>
  db.prepare('INSERT OR IGNORE INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)').bind(eventId, type, nowSec()).run();

/** Takes one hit back (the action did not happen after all: a failure that is not the visitor's doing must not use up their allowance). */
export async function giveBack(db: D1Database, key: string): Promise<void> {
  await db.prepare('UPDATE rate_limits SET count = count - 1 WHERE key = ? AND count > 0').bind(key).run();
}

/** Fixed-window limiter: true while under `limit` hits per `windowSec` for `key`. */
export async function allow(db: D1Database, key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = nowSec();
  const row = await db.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?').bind(key).first<{ window_start: number; count: number }>();
  if (!row || now - row.window_start >= windowSec) {
    // housekeeping: counters of finished windows are not kept
    await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86_400).run();
    await db.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1').bind(key, now).run();
    return true;
  }
  if (row.count >= limit) return false;
  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}
