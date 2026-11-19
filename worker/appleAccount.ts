import { logError } from './safeLog';
import { err, json } from './http';
import { allow, nowSec } from './db';
import { b64url, b64urlDecode, hmacHex, randomId, randomToken, safeEqual, sha256Hex } from './crypto';
import type { D1Database, Env } from './env';
import type { FetchFn } from './stripe';

/**
 * Optional account + records sync for the iOS app (Sign in with Apple; bearer tokens, no cookies, no CSRF/origin checks).
 *
 * SETUP NOTES (owner)
 *  - Needs the D1 binding `DB` and the var/secret `APPLE_BUNDLE_ID` (already used by the purchase endpoints).
 *    Without them every endpoint here answers 503 `not_configured`. No other secret is needed.
 *  - Apply the migration:  npx wrangler d1 migrations apply slides-db --remote   (migrations/0003_apple_accounts.sql).
 *    The Worker also creates the three tables idempotently, so a missing migration never breaks the endpoints.
 *  - The iOS app's Sign in with Apple capability must be on for the same Bundle ID (the token's `aud`).
 *
 * REVOCATION ON ACCOUNT DELETION (App Store rule 5.1.1(v)) is optional and needs four Worker Secrets (never in the repo):
 *    APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (full .p8 text), APPLE_TOKEN_KEY (long random string, >= 32 chars, only used to
 *    encrypt stored refresh tokens). Without all four everything else works and revoke is reported as "skipped".
 *  1. Apple Developer -> Certificates, Identifiers & Profiles -> Keys -> "+" -> enable "Sign in with Apple" -> Configure and choose
 *     the app's primary App ID -> Continue/Register -> Download the .p8 ONCE and note its Key ID. The Team ID is under Membership.
 *  2. npx wrangler secret put APPLE_TEAM_ID
 *     npx wrangler secret put APPLE_KEY_ID
 *     npx wrangler secret put APPLE_TOKEN_KEY          (e.g. the output of: openssl rand -base64 48)
 *     npx wrangler secret put APPLE_PRIVATE_KEY < AuthKey_XXXXXXXXXX.p8
 *  3. NEVER commit the .p8 file (or paste it anywhere public). Keep it only in your password manager / secure backup.
 *  How it works: the app sends `authorizationCode` with POST /api/apple/auth; the Worker exchanges it at
 *  https://appleid.apple.com/auth/token (client_secret = ES256 JWT signed with the .p8) and stores the refresh token AES-GCM
 *  encrypted in apple_tokens. A failed exchange never blocks sign-in. On POST /api/apple/account/delete all server data is deleted
 *  FIRST (never blocked by Apple), then https://appleid.apple.com/auth/revoke is called best effort; the answer is
 *  { ok: true, revoked: "revoked" | "skipped" | "failed" } (always HTTP 200 once the data is gone). Tokens/bodies are never logged.
 *
 * Endpoints: POST /api/apple/auth {identityToken, nonce, authorizationCode?}, GET|PUT /api/apple/sync, POST /api/apple/signout, POST /api/apple/account/delete.
 * Tokens are never logged; only the SHA-256 hash of a session token is stored.
 */

const ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const KEYS_TTL_MS = 3600_000;
const SKEW_SECONDS = 60;
export const APPLE_SESSION_SECONDS = 90 * 24 * 3600;
export const MAX_DOC_BYTES = 512 * 1024;
const MAX_BODY_BYTES = 1024 * 1024; // the doc may grow when JSON-escaped inside the envelope
const enc = new TextEncoder();

// ---- tables ----
const TABLES = [
  'CREATE TABLE IF NOT EXISTS apple_accounts (id TEXT PRIMARY KEY, apple_sub TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS apple_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS apple_sync (account_id TEXT PRIMARY KEY, version INTEGER NOT NULL, doc TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS apple_tokens (account_id TEXT PRIMARY KEY, enc TEXT NOT NULL, created_at INTEGER NOT NULL)',
];
const ready = new WeakMap<object, Promise<void>>();
function ensureTables(db: D1Database): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = (async () => { for (const q of TABLES) await db.prepare(q).run(); })().catch((e) => { ready.delete(db); throw e; });
    ready.set(db, p);
  }
  return p;
}

// ---- Apple identity token ----
let keyCache: { at: number; keys: JsonWebKey[] & { kid?: string }[] } | null = null;
export const resetAppleKeysForTests = (): void => { keyCache = null; };

async function fetchKeys(fetchFn: FetchFn): Promise<void> {
  const res = await fetchFn(APPLE_JWKS_URL);
  if (!res.ok) throw new Error('jwks fetch failed');
  const body = (await res.json()) as { keys?: unknown };
  if (!Array.isArray(body.keys)) throw new Error('jwks malformed');
  keyCache = { at: Date.now(), keys: body.keys as never };
}
async function keyFor(kid: string, fetchFn: FetchFn): Promise<JsonWebKey | null> {
  const find = () => keyCache?.keys.find((k) => (k as { kid?: string }).kid === kid && k.kty === 'RSA') ?? null;
  if (!keyCache || Date.now() - keyCache.at > KEYS_TTL_MS) await fetchKeys(fetchFn);
  return find() ?? (await fetchKeys(fetchFn), find()); // unknown kid: refetch once (Apple rotates keys)
}

const parseJson = (bytes: Uint8Array): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
};

/** Returns the Apple user id (`sub`) of a valid identity token for OUR app and this nonce, else null. Throws only on key-fetch failure. */
export async function verifyIdentityToken(token: string, nonce: string, bundleId: string, fetchFn: FetchFn, nowMs = Date.now()): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 8192) return null;
  let header: Record<string, unknown> | null, claims: Record<string, unknown> | null, sig: Uint8Array<ArrayBuffer>;
  try {
    header = parseJson(b64urlDecode(parts[0]));
    claims = parseJson(b64urlDecode(parts[1]));
    sig = b64urlDecode(parts[2]) as Uint8Array<ArrayBuffer>;
  } catch { return null; }
  if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  const jwk = await keyFor(header.kid, fetchFn);
  if (!jwk) return null;
  let ok = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, enc.encode(`${parts[0]}.${parts[1]}`));
  } catch { return null; }
  if (!ok) return null;
  if (claims.iss !== ISSUER || claims.aud !== bundleId) return null;
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECONDS <= nowMs / 1000) return null;
  if (typeof claims.nonce !== 'string' || !nonce || !safeEqual(claims.nonce.toLowerCase(), await sha256Hex(nonce))) return null;
  return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
}

// ---- revocation (client secret, refresh token encryption, token/revoke calls) ----
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const CLIENT_SECRET_SECONDS = 600;
const nonEmpty = (v: string | undefined): v is string => typeof v === 'string' && v.trim().length > 0;
const revocationConfigured = (env: Env): boolean => nonEmpty(env.APPLE_TEAM_ID) && nonEmpty(env.APPLE_KEY_ID) && nonEmpty(env.APPLE_PRIVATE_KEY) && nonEmpty(env.APPLE_TOKEN_KEY);

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/\\n/g, '\n').replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

/** The ES256 JWT Apple wants as `client_secret` (valid ~10 minutes). */
export async function makeClientSecret(env: Env, nowMs = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.APPLE_PRIVATE_KEY!), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const iat = Math.floor(nowMs / 1000);
  const h = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID })));
  const p = b64url(enc.encode(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat, exp: iat + CLIENT_SECRET_SECONDS, aud: ISSUER, sub: env.APPLE_BUNDLE_ID })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${h}.${p}`)); // raw r||s, as JWS wants
  return `${h}.${p}.${b64url(sig)}`;
}

async function tokenCryptoKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('slidewords apple refresh token v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptToken(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenCryptoKey(secret), enc.encode(plain));
  return `${b64url(iv)}.${b64url(ct)}`;
}
export async function decryptToken(secret: string, stored: string): Promise<string> {
  const [iv, ct] = stored.split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(iv) as Uint8Array<ArrayBuffer> }, await tokenCryptoKey(secret), b64urlDecode(ct) as Uint8Array<ArrayBuffer>);
  return new TextDecoder().decode(pt);
}

const form = (o: Record<string, string>): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

/** Exchanges the authorization code for a refresh token and stores it encrypted. Never throws, never blocks sign-in, never logs a body. */
async function storeRefreshToken(env: Env, db: D1Database, fetchFn: FetchFn, accountId: string, code: string): Promise<void> {
  try {
    const res = await fetchFn(APPLE_TOKEN_URL, form({ client_id: env.APPLE_BUNDLE_ID!, client_secret: await makeClientSecret(env), code, grant_type: 'authorization_code' }));
    if (!res.ok) { console.error(`apple token exchange failed: status=${res.status}`); return; }
    const refresh = ((await res.json()) as { refresh_token?: unknown }).refresh_token;
    if (typeof refresh !== 'string' || !refresh) { console.error('apple token exchange: no refresh token'); return; }
    await db.prepare('INSERT INTO apple_tokens (account_id, enc, created_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET enc = excluded.enc, created_at = excluded.created_at')
      .bind(accountId, await encryptToken(env.APPLE_TOKEN_KEY!, refresh), nowSec()).run();
  } catch (e) {
    logError('apple token exchange error', e);
  }
}

type Revoked = 'revoked' | 'skipped' | 'failed';
async function revokeToken(env: Env, fetchFn: FetchFn, refresh: string): Promise<Revoked> {
  try {
    const res = await fetchFn(APPLE_REVOKE_URL, form({ client_id: env.APPLE_BUNDLE_ID!, client_secret: await makeClientSecret(env), token: refresh, token_type_hint: 'refresh_token' }));
    if (!res.ok) { console.error(`apple revoke failed: status=${res.status}`); return 'failed'; }
    return 'revoked';
  } catch (e) {
    logError('apple revoke error', e);
    return 'failed';
  }
}

// ---- helpers ----
const bearer = (request: Request): string => {
  const a = request.headers.get('authorization') ?? '';
  const t = a.startsWith('Bearer ') ? a.slice(7).trim() : '';
  return t.length > 0 && t.length <= 200 ? t : '';
};
async function accountFor(db: D1Database, token: string): Promise<string | null> {
  if (!token) return null;
  const row = await db.prepare('SELECT s.account_id AS id FROM apple_sessions s JOIN apple_accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(await sha256Hex(token), nowSec()).first<{ id: string }>();
  return row?.id ?? null;
}
async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => null);
  if (text === null || text.length > maxBytes || enc.encode(text).length > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

// ---- handlers ----
async function signIn(request: Request, env: Env, db: D1Database, fetchFn: FetchFn): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const who = (env.SESSION_SECRET ? await hmacHex(env.SESSION_SECRET, `ip|${ip}`) : await sha256Hex(`apple-ip|${ip}`)).slice(0, 32);
  if (!(await allow(db, `appleauth:${who}`, 20, 600))) return err(429, 'rate_limited');
  const body = await readJson(request, 16 * 1024);
  if (!body || typeof body.identityToken !== 'string' || typeof body.nonce !== 'string') return err(400, 'bad_request');
  const sub = await verifyIdentityToken(body.identityToken, body.nonce, env.APPLE_BUNDLE_ID!, fetchFn);
  if (!sub) return err(401, 'invalid_token');
  const now = nowSec();
  await db.prepare('INSERT INTO apple_accounts (id, apple_sub, created_at) VALUES (?, ?, ?) ON CONFLICT(apple_sub) DO NOTHING').bind(randomId(), sub, now).run();
  const acc = await db.prepare('SELECT id FROM apple_accounts WHERE apple_sub = ?').bind(sub).first<{ id: string }>();
  if (!acc) return err(500, 'server_error');
  const token = randomToken(32);
  await db.prepare('INSERT INTO apple_sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), acc.id, now, now + APPLE_SESSION_SECONDS).run();
  await db.prepare('DELETE FROM apple_sessions WHERE expires_at < ?').bind(now).run(); // housekeeping
  if (typeof body.authorizationCode === 'string' && body.authorizationCode && body.authorizationCode.length <= 4096 && revocationConfigured(env)) {
    await storeRefreshToken(env, db, fetchFn, acc.id, body.authorizationCode);
  }
  return json({ token, accountId: acc.id });
}

async function getSync(db: D1Database, accountId: string): Promise<Response> {
  const row = await db.prepare('SELECT version, doc, updated_at FROM apple_sync WHERE account_id = ?').bind(accountId).first<{ version: number; doc: string; updated_at: number }>();
  return json(row ? { version: row.version, doc: row.doc, updatedAt: row.updated_at } : { version: 0, doc: null, updatedAt: null });
}

async function putSync(request: Request, db: D1Database, accountId: string): Promise<Response> {
  if (!(await allow(db, `applesync:${accountId}`, 120, 3600))) return err(429, 'rate_limited');
  const body = await readJson(request, MAX_BODY_BYTES);
  if (!body || typeof body.doc !== 'string' || typeof body.baseVersion !== 'number' || !Number.isInteger(body.baseVersion) || body.baseVersion < 0) return err(400, 'bad_request');
  if (enc.encode(body.doc).length > MAX_DOC_BYTES) return err(413, 'too_large');
  try { JSON.parse(body.doc); } catch { return err(400, 'bad_doc'); }
  const now = nowSec();
  // one conditional statement decides the winner, so two writers with the same baseVersion cannot both succeed
  const r = body.baseVersion === 0
    ? await db.prepare('INSERT INTO apple_sync (account_id, version, doc, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(account_id) DO NOTHING').bind(accountId, body.doc, now).run()
    : await db.prepare('UPDATE apple_sync SET version = version + 1, doc = ?, updated_at = ? WHERE account_id = ? AND version = ?').bind(body.doc, now, accountId, body.baseVersion).run();
  if ((r.meta?.changes ?? 0) === 1) return json({ version: body.baseVersion + 1 });
  const cur = await db.prepare('SELECT version, doc FROM apple_sync WHERE account_id = ?').bind(accountId).first<{ version: number; doc: string }>();
  return json({ error: 'conflict', version: cur?.version ?? 0, doc: cur?.doc ?? null }, 409);
}

/** Routes /api/apple/auth|sync|signout|account/delete. Fails closed. */
export async function handleAppleAccount(request: Request, env: Env, fetchFn: FetchFn = (i, init) => fetch(i, init)): Promise<Response> {
  const path = new URL(request.url).pathname;
  const method = request.method;
  const allowed: Record<string, string[]> = { '/api/apple/auth': ['POST'], '/api/apple/sync': ['GET', 'PUT'], '/api/apple/signout': ['POST'], '/api/apple/account/delete': ['POST'] };
  const methods = allowed[path];
  if (!methods) return err(404, 'not_found');
  if (!env.APPLE_BUNDLE_ID || !env.DB) return err(503, 'not_configured');
  if (!methods.includes(method)) return err(405, 'method');
  const db = env.DB;
  try {
    await ensureTables(db);
    if (path === '/api/apple/auth') return await signIn(request, env, db, fetchFn);
    const token = bearer(request);
    const accountId = await accountFor(db, token);
    if (!accountId) return err(401, 'signin_required');
    if (path === '/api/apple/sync') return method === 'GET' ? await getSync(db, accountId) : await putSync(request, db, accountId);
    if (path === '/api/apple/signout') {
      await db.prepare('DELETE FROM apple_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
      return json({ ok: true });
    }
    // account delete: read the (encrypted) refresh token first, delete ALL server data (never blocked by Apple), then revoke best effort
    let refresh: string | null = null;
    let undecryptable = false;
    if (revocationConfigured(env)) {
      const row = await db.prepare('SELECT enc FROM apple_tokens WHERE account_id = ?').bind(accountId).first<{ enc: string }>();
      if (row) { try { refresh = await decryptToken(env.APPLE_TOKEN_KEY!, row.enc); } catch (e) { undecryptable = true; logError('apple token decrypt error', e); } }
    }
    await db.batch([
      db.prepare('DELETE FROM apple_sessions WHERE account_id = ?').bind(accountId),
      db.prepare('DELETE FROM apple_sync WHERE account_id = ?').bind(accountId),
      db.prepare('DELETE FROM apple_tokens WHERE account_id = ?').bind(accountId),
      db.prepare('DELETE FROM apple_accounts WHERE id = ?').bind(accountId),
    ]);
    const revoked: Revoked = refresh ? await revokeToken(env, fetchFn, refresh) : undecryptable ? 'failed' : 'skipped';
    return json({ ok: true, revoked });
  } catch (e) {
    logError('apple account error', e);
    return err(503, 'unavailable');
  }
}
