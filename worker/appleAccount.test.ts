import { generateKeyPairSync, createHash, createSign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database, D1PreparedStatement, Env } from './env';
import { handle } from './index';
import { resetAppleKeysForTests } from './appleAccount';

function makeDb(migrate = true): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  if (migrate) raw.exec(readFileSync(new URL('../migrations/0003_apple_accounts.sql', import.meta.url), 'utf8'));
  const d1: D1Database = {
    prepare(q: string) {
      let args: unknown[] = [];
      const st: D1PreparedStatement = {
        bind: (...v: unknown[]) => ((args = v), st),
        first: async <T,>() => ((raw.prepare(q).get(...(args as never[])) as T | undefined) ?? null),
        all: async <T,>() => ({ results: raw.prepare(q).all(...(args as never[])) as T[], success: true }),
        run: async () => ({ success: true, meta: { changes: Number(raw.prepare(q).run(...(args as never[])).changes) } }),
      };
      return st;
    },
    batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
  return { d1, raw };
}

const BUNDLE = 'com.test.app';
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const mkKey = () => { const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }); return { privateKey, jwk: publicKey.export({ format: 'jwk' }) as Record<string, string> }; };
let good = mkKey();
let other = mkKey();
const nowS = () => Math.floor(Date.now() / 1000);

function sign(key: KeyObject, claims: Record<string, unknown>, hdr: Record<string, unknown> = {}): string {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', ...hdr }));
  const p = b64u(JSON.stringify(claims));
  const s = createSign('RSA-SHA256').update(`${h}.${p}`).sign(key);
  return `${h}.${p}.${b64u(s)}`;
}
const claimsFor = (nonce: string, o: Record<string, unknown> = {}) => ({ iss: 'https://appleid.apple.com', aud: BUNDLE, exp: nowS() + 600, sub: 'apple-user-1', nonce: sha(nonce), ...o });

let calls = 0;
let jwks: { kid: string; jwk: Record<string, string> }[] = [];
const fetchFn = async (url: string) => {
  calls++;
  expect(url).toBe('https://appleid.apple.com/auth/keys');
  return new Response(JSON.stringify({ keys: jwks.map((k) => ({ ...k.jwk, kid: k.kid, alg: 'RS256', use: 'sig' })) }), { status: 200 });
};

let d1: D1Database, raw: DatabaseSync;
const env = (extra: Partial<Env> = {}): Env => ({ ASSETS: { fetch: async () => new Response('x') }, DB: d1, APPLE_BUNDLE_ID: BUNDLE, ...extra }) as Env;
const req = (method: string, path: string, body?: unknown, token?: string, ip = '1.1.1.1') =>
  new Request(`https://slides.example${path}`, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
const call = (r: Request, e = env()) => handle(r, e, { fetchFn });
const count = (t: string) => (raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

async function signIn(sub = 'apple-user-1', ip = '1.1.1.1') {
  const nonce = `nonce-${Math.random()}`;
  const res = await call(req('POST', '/api/apple/auth', { identityToken: sign(good.privateKey, claimsFor(nonce, { sub })), nonce }, undefined, ip));
  return { res, body: (await res.json()) as { token: string; accountId: string } };
}

beforeEach(() => {
  ({ d1, raw } = makeDb());
  resetAppleKeysForTests();
  calls = 0;
  jwks = [{ kid: 'k1', jwk: good.jwk }];
});

describe('POST /api/apple/auth', () => {
  it('creates an account and a session (only the token hash is stored)', async () => {
    const { res, body } = await signIn();
    expect(res.status).toBe(200);
    expect(body.token.length).toBeGreaterThan(40);
    expect(count('apple_accounts')).toBe(1);
    const s = raw.prepare('SELECT token_hash, account_id, expires_at - created_at AS ttl FROM apple_sessions').get() as { token_hash: string; account_id: string; ttl: number };
    expect(s.token_hash).toBe(sha(body.token));
    expect(s.token_hash).not.toBe(body.token);
    expect(s.account_id).toBe(body.accountId);
    expect(s.ttl).toBe(90 * 24 * 3600);
  });
  it('the same sub gets the same accountId; another sub another one', async () => {
    const a = await signIn(), b = await signIn(), c = await signIn('someone-else');
    expect(b.body.accountId).toBe(a.body.accountId);
    expect(b.body.token).not.toBe(a.body.token);
    expect(c.body.accountId).not.toBe(a.body.accountId);
    expect(count('apple_accounts')).toBe(2);
    expect(count('apple_sessions')).toBe(3);
  });
  it('deletes expired sessions opportunistically', async () => {
    const a = await signIn();
    raw.prepare('UPDATE apple_sessions SET expires_at = ?').run(nowS() - 10);
    await signIn();
    expect(count('apple_sessions')).toBe(1);
    expect(a.res.status).toBe(200);
  });
  const bad: [string, (n: string) => string][] = [
    ['wrong iss', (n) => sign(good.privateKey, claimsFor(n, { iss: 'https://evil.example' }))],
    ['wrong aud', (n) => sign(good.privateKey, claimsFor(n, { aud: 'com.other.app' }))],
    ['expired', (n) => sign(good.privateKey, claimsFor(n, { exp: nowS() - 3600 }))],
    ['missing exp', (n) => sign(good.privateKey, claimsFor(n, { exp: undefined }))],
    ['wrong nonce', (n) => sign(good.privateKey, { ...claimsFor(n), nonce: sha('other') })],
    ['raw (unhashed) nonce', (n) => sign(good.privateKey, { ...claimsFor(n), nonce: n })],
    ['missing sub', (n) => sign(good.privateKey, claimsFor(n, { sub: undefined }))],
    ['bad signature (other key)', (n) => sign(other.privateKey, claimsFor(n))],
    ['unknown kid', (n) => sign(good.privateKey, claimsFor(n), { kid: 'nope' })],
    ['alg none', (n) => sign(good.privateKey, claimsFor(n), { alg: 'none' })],
    ['alg HS256', (n) => sign(good.privateKey, claimsFor(n), { alg: 'HS256' })],
    ['garbage', () => 'a.b.c'],
    ['not a jwt', () => 'xyz'],
  ];
  for (const [name, mk] of bad) {
    it(`rejects ${name} with 401 and writes nothing`, async () => {
      const nonce = 'n-1';
      const res = await call(req('POST', '/api/apple/auth', { identityToken: mk(nonce), nonce }));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_token' });
      expect(count('apple_accounts')).toBe(0);
      expect(count('apple_sessions')).toBe(0);
    });
  }
  it('rejects a tampered payload', async () => {
    const [h, , s] = sign(good.privateKey, claimsFor('n')).split('.');
    const res = await call(req('POST', '/api/apple/auth', { identityToken: `${h}.${b64u(JSON.stringify(claimsFor('n', { sub: 'victim' })))}.${s}`, nonce: 'n' }));
    expect(res.status).toBe(401);
    expect(count('apple_accounts')).toBe(0);
  });
  it('rejects malformed bodies with 400', async () => {
    for (const b of ['{', '[]', { identityToken: 1, nonce: 'n' }, { identityToken: 'x' }]) expect((await call(req('POST', '/api/apple/auth', b))).status).toBe(400);
  });
  it('fetches the keys once and caches them; an unknown kid triggers exactly one refetch', async () => {
    await signIn();
    await signIn();
    expect(calls).toBe(1);
    jwks = [{ kid: 'k1', jwk: good.jwk }, { kid: 'k2', jwk: other.jwk }]; // Apple rotated in a new key
    const nonce = 'n2';
    const res = await call(req('POST', '/api/apple/auth', { identityToken: sign(other.privateKey, claimsFor(nonce), { kid: 'k2' }), nonce }));
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
    const unknown = await call(req('POST', '/api/apple/auth', { identityToken: sign(good.privateKey, claimsFor(nonce), { kid: 'zzz' }), nonce }));
    expect(unknown.status).toBe(401);
    expect(calls).toBe(3); // one refetch for that request, not more
  });
  it('fails closed (503) when Apple keys cannot be fetched', async () => {
    const res = await handle(req('POST', '/api/apple/auth', { identityToken: sign(good.privateKey, claimsFor('n')), nonce: 'n' }), env(), { fetchFn: async () => new Response('no', { status: 500 }) });
    expect(res.status).toBe(503);
    expect(count('apple_sessions')).toBe(0);
  });
  it('is rate limited per client (20 per 10 minutes) without storing the address', async () => {
    for (let i = 0; i < 20; i++) expect((await signIn('u', '9.9.9.9')).res.status).toBe(200);
    expect((await signIn('u', '9.9.9.9')).res.status).toBe(429);
    expect((await signIn('u', '8.8.8.8')).res.status).toBe(200);
    const keys = (raw.prepare('SELECT key FROM rate_limits').all() as { key: string }[]).map((r) => r.key).join(' ');
    expect(keys).not.toContain('9.9.9.9');
  });
  it('rejects a wrong method', async () => expect((await call(req('GET', '/api/apple/auth'))).status).toBe(405));
});

describe('sync', () => {
  it('GET is empty at first, then PUT/GET round-trips and versions count up', async () => {
    const { token } = (await signIn()).body;
    expect(await (await call(req('GET', '/api/apple/sync', undefined, token))).json()).toEqual({ version: 0, doc: null, updatedAt: null });
    const p1 = await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{"a":1}' }, token));
    expect(p1.status).toBe(200);
    expect(await p1.json()).toEqual({ version: 1 });
    const p2 = await call(req('PUT', '/api/apple/sync', { baseVersion: 1, doc: '[1,2]' }, token));
    expect(await p2.json()).toEqual({ version: 2 });
    const g = (await (await call(req('GET', '/api/apple/sync', undefined, token))).json()) as { version: number; doc: string; updatedAt: number };
    expect(g.version).toBe(2);
    expect(g.doc).toBe('[1,2]');
    expect(typeof g.updatedAt).toBe('number');
  });
  it('a stale baseVersion gets 409 with the stored doc and stores nothing', async () => {
    const { token } = (await signIn()).body;
    await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{"v":1}' }, token));
    for (const base of [0, 5]) {
      const r = await call(req('PUT', '/api/apple/sync', { baseVersion: base, doc: '{"v":"mine"}' }, token));
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: 'conflict', version: 1, doc: '{"v":1}' });
    }
    expect(raw.prepare('SELECT version, doc FROM apple_sync').get()).toEqual({ version: 1, doc: '{"v":1}' });
  });
  it('rejects oversize, non-JSON, non-string docs and bad baseVersions', async () => {
    const { token } = (await signIn()).body;
    const put = (b: unknown) => call(req('PUT', '/api/apple/sync', b, token));
    expect((await put({ baseVersion: 0, doc: JSON.stringify('x'.repeat(512 * 1024)) })).status).toBe(413);
    expect((await put({ baseVersion: 0, doc: JSON.stringify('é'.repeat(270_000)) })).status).toBe(413); // bytes, not characters
    expect((await put({ baseVersion: 0, doc: '{nope' })).status).toBe(400);
    expect((await put({ baseVersion: 0, doc: { a: 1 } })).status).toBe(400);
    expect((await put({ baseVersion: -1, doc: '{}' })).status).toBe(400);
    expect((await put({ baseVersion: 1.5, doc: '{}' })).status).toBe(400);
    expect((await put({ baseVersion: '0', doc: '{}' })).status).toBe(400);
    expect((await put('not json')).status).toBe(400);
    expect(count('apple_sync')).toBe(0);
    expect((await put({ baseVersion: 0, doc: JSON.stringify('x'.repeat(512 * 1024 - 2)) })).status).toBe(200); // exactly at the limit
  });
  it('two concurrent PUTs with the same baseVersion: exactly one wins', async () => {
    const { token } = (await signIn()).body;
    for (const base of [0, 1]) {
      if (base === 1) await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{}' }, token));
      const rs = await Promise.all(['"a"', '"b"', '"c"'].map((doc) => call(req('PUT', '/api/apple/sync', { baseVersion: base === 0 ? 0 : 1, doc }, token))));
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      expect((raw.prepare('SELECT version FROM apple_sync').get() as { version: number }).version).toBe(base + 1);
    }
  });
  it('requires a valid session: missing, garbage, unknown and expired tokens give 401 signin_required', async () => {
    const { token } = (await signIn()).body;
    for (const t of [undefined, 'garbage', 'x'.repeat(500), token + 'x']) {
      const r = await call(req('GET', '/api/apple/sync', undefined, t));
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: 'signin_required' });
      expect((await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{}' }, t))).status).toBe(401);
    }
    expect(count('apple_sync')).toBe(0);
    raw.prepare('UPDATE apple_sessions SET expires_at = ?').run(nowS() - 1);
    expect((await call(req('GET', '/api/apple/sync', undefined, token))).status).toBe(401);
    expect((await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{}' }, token))).status).toBe(401);
  });
  it('another account cannot read or overwrite someone else\'s doc', async () => {
    const a = (await signIn('alice')).body, b = (await signIn('bob')).body;
    await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{"secret":1}' }, a.token));
    expect(await (await call(req('GET', '/api/apple/sync', undefined, b.token))).json()).toEqual({ version: 0, doc: null, updatedAt: null });
    expect((await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{"bob":1}' }, b.token))).status).toBe(200);
    expect((await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{"bob":2}' }, b.token))).status).toBe(409); // bob's own row is at version 1; alice's is never consulted
    const rowA = raw.prepare('SELECT doc FROM apple_sync WHERE account_id = ?').get(a.accountId) as { doc: string };
    expect(rowA.doc).toBe('{"secret":1}');
  });
  it('limits writes to 120 per hour per account', async () => {
    const { token } = (await signIn()).body;
    let v = 0;
    for (let i = 0; i < 120; i++) { const r = await call(req('PUT', '/api/apple/sync', { baseVersion: v, doc: '{}' }, token)); expect(r.status).toBe(200); v++; }
    expect((await call(req('PUT', '/api/apple/sync', { baseVersion: v, doc: '{}' }, token))).status).toBe(429);
  });
});

describe('signout and account delete', () => {
  it('signout invalidates only that token', async () => {
    const a = (await signIn()).body, b = (await signIn()).body;
    const r = await call(req('POST', '/api/apple/signout', undefined, a.token));
    expect(await r.json()).toEqual({ ok: true });
    expect((await call(req('GET', '/api/apple/sync', undefined, a.token))).status).toBe(401);
    expect((await call(req('GET', '/api/apple/sync', undefined, b.token))).status).toBe(200);
    expect((await call(req('POST', '/api/apple/signout', undefined, a.token))).status).toBe(401);
  });
  it('account delete removes the account, all its sessions and its doc, and nobody else\'s', async () => {
    const a1 = (await signIn('alice')).body, a2 = (await signIn('alice')).body, b = (await signIn('bob')).body;
    await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{"a":1}' }, a1.token));
    await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{"b":1}' }, b.token));
    const r = await call(req('POST', '/api/apple/account/delete', undefined, a1.token));
    expect(await r.json()).toEqual({ ok: true, revoked: 'skipped' });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM apple_accounts WHERE id = ?').get(a1.accountId)).toEqual({ n: 0 });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM apple_sessions WHERE account_id = ?').get(a1.accountId)).toEqual({ n: 0 });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM apple_sync WHERE account_id = ?').get(a1.accountId)).toEqual({ n: 0 });
    expect((await call(req('GET', '/api/apple/sync', undefined, a2.token))).status).toBe(401);
    expect(count('apple_accounts')).toBe(1);
    expect(count('apple_sync')).toBe(1);
    expect((await call(req('GET', '/api/apple/sync', undefined, b.token))).status).toBe(200);
  });
});

describe('account-session artwork downloads', () => {
  it('requires a live account entitlement and serves the artwork privately', async () => {
    const { body } = await signIn('stripe-linked-user');
    expect((await call(req('GET', '/api/apple/account-artwork/monet-stacks', undefined, body.token))).status).toBe(403);
    raw.prepare('INSERT INTO apple_entitlements (original_transaction_id, apple_account_id, expires_ms, revoked, updated_at) VALUES (?, ?, ?, 0, ?)')
      .run('tx-download-1', body.accountId, Date.now() + 3_600_000, Date.now());
    const ok = await call(req('GET', '/api/apple/account-artwork/monet-stacks', undefined, body.token));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('x');
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
    expect((await call(req('GET', '/api/apple/account-artwork/monet-stacks'))).status).toBe(401);
    expect((await call(req('POST', '/api/apple/account-artwork/monet-stacks', {}, body.token))).status).toBe(405);
  });
  it('accepts a Stripe entitlement on the Google account linked to the iOS session', async () => {
    const { body } = await signIn('apple-linked-to-google');
    // The first request creates the idempotent mode/entitlement tables, just
    // like a fresh Worker instance does in production.
    expect((await call(req('GET', '/api/apple/account-artwork/monet-stacks', undefined, body.token))).status).toBe(403);
    raw.prepare('INSERT INTO users (id, google_sub, name, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)')
      .run('web-user-1', 'google-sub-1', nowS(), nowS());
    raw.prepare('INSERT INTO apple_account_links (apple_account_id, user_id, linked_at) VALUES (?, ?, ?)')
      .run(body.accountId, 'web-user-1', nowS());
    raw.prepare('INSERT INTO stripe_subscriptions (user_id, livemode, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at) VALUES (?, 1, ?, ?, ?, 0, ?)')
      .run('web-user-1', 'sub-google-1', 'active', nowS() + 3600, nowS());
    expect((await call(req('GET', '/api/apple/account-artwork/monet-stacks', undefined, body.token))).status).toBe(200);
  });
});

describe('shared StoreKit entitlements', () => {
  const googleFetch = async (url: string) => {
    if (url.startsWith('https://oauth2.googleapis.com/tokeninfo?')) {
      return new Response(JSON.stringify({ sub: 'google-premium-user', aud: 'ios-google-client', exp: nowS() + 600 }), { status: 200 });
    }
    return fetchFn(url);
  };
  const googleEnv = () => env({ GOOGLE_IOS_CLIENT_ID: 'ios-google-client' });

  it('makes a verified StoreKit entitlement on a Google iOS session available to that common account', async () => {
    const signedIn = await handle(req('POST', '/api/apple/google/auth', { idToken: 'google-id-token' }), googleEnv(), { fetchFn: googleFetch });
    expect(signedIn.status).toBe(200);
    const session = await signedIn.json() as { token: string; accountId: string };
    // This row represents the result of the separately tested signed-JWS
    // verification in POST /api/apple/entitlement.
    raw.prepare('INSERT INTO apple_entitlements (original_transaction_id, apple_account_id, expires_ms, revoked, updated_at) VALUES (?, ?, ?, 0, ?)')
      .run('google-purchase-1', session.accountId, Date.now() + 3_600_000, Date.now());
    const status = await call(req('GET', '/api/apple/status', undefined, session.token), googleEnv());
    expect(await status.json()).toMatchObject({ signedIn: true, linkedGoogle: true, premium: true, sources: { apple: true } });
    const link = raw.prepare('SELECT user_id FROM apple_account_links WHERE apple_account_id = ?').get(session.accountId) as { user_id: string };
    expect(raw.prepare('SELECT google_sub FROM users WHERE id = ?').get(link.user_id)).toEqual({ google_sub: 'google-premium-user' });
  });

  it('preserves a Google-session StoreKit entitlement when the user explicitly links Apple and Google', async () => {
    const apple = (await signIn('real-apple-user')).body;
    const google = await handle(req('POST', '/api/apple/google/auth', { idToken: 'google-id-token' }), googleEnv(), { fetchFn: googleFetch });
    const googleSession = await google.json() as { accountId: string };
    raw.prepare('INSERT INTO apple_entitlements (original_transaction_id, apple_account_id, expires_ms, revoked, updated_at) VALUES (?, ?, ?, 0, ?)')
      .run('move-on-link-1', googleSession.accountId, Date.now() + 3_600_000, Date.now());
    const linked = await handle(req('POST', '/api/apple/link/google', { idToken: 'google-id-token' }, apple.token), googleEnv(), { fetchFn: googleFetch });
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({ premium: true, sources: { apple: true } });
    expect(raw.prepare('SELECT apple_account_id FROM apple_entitlements WHERE original_transaction_id = ?').get('move-on-link-1')).toEqual({ apple_account_id: apple.accountId });
  });
});

describe('configuration and wiring', () => {
  it('answers 503 not_configured without APPLE_BUNDLE_ID or without the DB', async () => {
    for (const e of [env({ APPLE_BUNDLE_ID: undefined }), env({ DB: undefined })]) {
      for (const [m, p] of [['POST', '/api/apple/auth'], ['POST', '/api/apple/google/auth'], ['GET', '/api/apple/sync'], ['PUT', '/api/apple/sync'], ['POST', '/api/apple/signout'], ['POST', '/api/apple/account/delete'], ['GET', '/api/apple/status'], ['POST', '/api/apple/link/google'], ['POST', '/api/apple/entitlement']] as const) {
        const r = await call(req(m, p, m === 'GET' ? undefined : {}, 'tok'), e);
        expect(r.status).toBe(503);
        expect(await r.json()).toEqual({ error: 'not_configured' });
      }
    }
  });
  it('creates its tables itself when the migration was not applied', async () => {
    ({ d1, raw } = makeDb(false));
    const { res, body } = await signIn();
    expect(res.status).toBe(200);
    expect((await call(req('PUT', '/api/apple/sync', { baseVersion: 0, doc: '{}' }, body.token))).status).toBe(200);
  });
  it('fails closed on a database error', async () => {
    const broken = { prepare: () => { throw new Error('boom'); }, batch: async () => [] } as unknown as D1Database;
    const r = await call(req('GET', '/api/apple/sync', undefined, 'tok'), env({ DB: broken }));
    expect(r.status).toBe(503);
  });
  it('does not touch the website routes (unknown /api/apple path is still 404, /api/me still needs the Google setup)', async () => {
    expect((await call(req('GET', '/api/apple/other'))).status).toBe(404);
    expect((await call(req('GET', '/api/me'))).status).toBe(503);
  });
});
