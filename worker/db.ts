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

export const getSubscription = (db: D1Database, userId: string) =>
  db.prepare('SELECT stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at FROM subscriptions WHERE user_id = ?')
    .bind(userId).first<SubscriptionRow & { stripe_subscription_id: string; updated_at: number }>();

export const setStripeCustomer = (db: D1Database, userId: string, customerId: string) =>
  db.prepare('UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ?').bind(customerId, nowSec(), userId).run();

export const userByCustomer = (db: D1Database, customerId: string) =>
  db.prepare('SELECT id, google_sub, name, stripe_customer_id FROM users WHERE stripe_customer_id = ?').bind(customerId).first<UserRow>();
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
export async function saveSubscription(db: D1Database, userId: string, s: SubscriptionInput, hasAccess: (row: SubscriptionRow) => boolean): Promise<boolean> {
  const current = await getSubscription(db, userId);
  if (current && current.stripe_subscription_id !== s.stripe_subscription_id && hasAccess(current)) return false;
  await db
    .prepare(
      `INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET stripe_subscription_id = excluded.stripe_subscription_id, status = excluded.status,
         current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at`,
    )
    .bind(userId, s.stripe_subscription_id, s.status, s.current_period_end, s.cancel_at_period_end ? 1 : 0, nowSec())
    .run();
  return true;
}

/** Removes the account's own data. The Stripe customer record itself stays with Stripe (billing records). */
export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
}

export async function eventSeen(db: D1Database, eventId: string): Promise<boolean> {
  return !!(await db.prepare('SELECT event_id FROM stripe_events WHERE event_id = ?').bind(eventId).first());
}
export const markEvent = (db: D1Database, eventId: string, type: string) =>
  db.prepare('INSERT OR IGNORE INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)').bind(eventId, type, nowSec()).run();

/** Fixed-window limiter: true while under `limit` hits per `windowSec` for `key`. */
export async function allow(db: D1Database, key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = nowSec();
  const row = await db.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?').bind(key).first<{ window_start: number; count: number }>();
  if (!row || now - row.window_start >= windowSec) {
    await db.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1').bind(key, now).run();
    return true;
  }
  if (row.count >= limit) return false;
  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}
