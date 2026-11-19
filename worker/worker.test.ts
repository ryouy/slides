import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimsValid, decodeClaims } from './auth';
import { hmacHex } from './crypto';
import type { D1Database, D1PreparedStatement, Env } from './env';
import { hasPremium, RENEWAL_GRACE_SECONDS } from './entitlement';
import { safeReturnPath } from './http';
import worker, { handle } from './index';
import { fullImageId, isDailyImage } from './artwork';
import { ARTWORKS } from '../src/games/art-slide/data';
import { FREE_ARTWORK_IDS } from '../src/premium/freeList';
import { formEncode, StripeError, verifyStripeSignature, type FetchFn } from './stripe';
import { describeError, redact } from './safeLog';
import { resetPriceCheckForTests as priceCheckedReset } from './billing';
import { ALLOWLIST_MAX, parseAllowlist, publicSalesOpen, purchaseAllowed } from './env';

// ---- an in-memory D1 (SQLite) running the real migration ----
function makeDb(withModeMigration = true): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  if (withModeMigration) raw.exec(readFileSync(new URL('../migrations/0002_stripe_modes.sql', import.meta.url), 'utf8'));
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
    batch: async (stmts) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
  return { d1, raw };
}

// ---- a fake Google + Stripe ----
const SITE = 'https://slides.example';
const jwt = (claims: object) => `x.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.y`;
interface Fake { sub: Record<string, unknown>; calls: string[]; googleClaims: Record<string, unknown>; failStripe: boolean; price: Record<string, unknown>; openSessions: { id: string }[]; createdSessions: number; nextCustomer?: string; missingSubs?: Set<string>; missingCustomers: Set<string>; livemodeOf: (key: string) => boolean }
const goodPrice = { id: 'price_1Abc23DEF', active: true, livemode: false, currency: 'jpy', unit_amount: 200, type: 'recurring', recurring: { interval: 'month', interval_count: 1 } };
function makeFetch(f: Fake): FetchFn {
  return async (input, init) => {
    const method = init?.method ?? 'GET';
    f.calls.push(`${method} ${input}`);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (input.startsWith('https://oauth2.googleapis.com/token')) return ok({ id_token: jwt(f.googleClaims) });
    if (f.failStripe) return new Response('{"error":"boom"}', { status: 500 });
    if (input.endsWith('/v1/customers') && method === 'POST') return ok({ id: f.nextCustomer ?? 'cus_1' });
    if (input.includes('/v1/customers/') && method === 'GET') {
      const id = decodeURIComponent(input.split('/v1/customers/')[1]);
      // Stripe: a customer of the other mode "does not exist" for this key
      return f.missingCustomers.has(id) ? new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such customer: '${id}'` } }), { status: 404 }) : ok({ id, livemode: f.livemodeOf(String((init?.headers as Record<string, string> | undefined)?.authorization ?? '')) });
    }
    if (input.includes('/v1/prices/')) return ok({ ...f.price, id: decodeURIComponent(input.split('/v1/prices/')[1]) });
    if (input.includes('/v1/checkout/sessions?customer=')) return ok({ data: f.openSessions });
    if (input.includes('/expire') && method === 'POST') { f.openSessions = f.openSessions.filter((x) => !input.includes(x.id)); return ok({ id: 'expired' }); }
    if (input.endsWith('/v1/checkout/sessions')) { f.createdSessions++; return ok({ id: 'cs_1', url: 'https://checkout.stripe.test/c/1' }); }
    if (input.endsWith('/v1/billing_portal/sessions')) return ok({ url: 'https://billing.stripe.test/p/1' });
    if (input.includes('/v1/subscriptions?customer=')) {
      const c = decodeURIComponent(input.split('customer=')[1].split('&')[0]);
      // exactly what Stripe answered in production: HTTP 400 resource_missing for a customer of the other mode
      if (f.missingCustomers.has(c)) return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such customer: '${c}'; a similar object exists in test mode, but a live mode key was used to make this request.` } }), { status: 400 });
      return ok({ data: f.sub.id ? [f.sub] : [] });
    }
    if (input.includes('/v1/subscriptions/sub_1')) {
      if (f.missingSubs?.has('sub_1')) return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such subscription' } }), { status: 404 });
      if (method === 'DELETE') return ok((f.sub = { ...f.sub, status: 'canceled' }));
      return ok(f.sub);
    }
    return new Response('{}', { status: 404 });
  };
}

let env: Env;
let raw: DatabaseSync;
let fake: Fake;
let fetchFn: FetchFn;
const NOW = () => Math.floor(Date.now() / 1000);
/** puts a Stripe customer on an account for the TEST mode (the tests use a test key), as a checkout would */
const fileCustomer = (userId: string, customerId: string, livemode = 0) => raw.prepare('INSERT OR REPLACE INTO stripe_customers (user_id, livemode, customer_id, created_at) VALUES (?, ?, ?, ?)').run(userId, livemode, customerId, NOW());
const baseEnv = (d1: D1Database): Env => ({
  ASSETS: { fetch: async () => new Response('asset') },
  DB: d1,
  SITE_URL: SITE,
  GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'gsecret',
  SESSION_SECRET: 'session-secret',
  STRIPE_SECRET_KEY: 'sk_test_x1234567890',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRICE_ID: 'price_1Abc23DEF',
  PURCHASES_ENABLED: 'true',
});
const sub = (over: Record<string, unknown> = {}) => ({ id: 'sub_1', status: 'active', customer: 'cus_1', cancel_at_period_end: false, current_period_end: NOW() + 20 * 86400, metadata: { user_id: '' }, ...over });

const call = (path: string, init: RequestInit & { cookie?: string; origin?: string | null } = {}) => {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.origin !== null && init.method === 'POST') headers.set('origin', init.origin ?? SITE);
  return handle(new Request(`${SITE}${path}`, { ...init, headers }), env, { fetchFn });
};
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith(`${name}=`));

/** Runs the whole login and returns the session cookie. */
async function login(sub_ = 'google-sub-1', name = 'Ann Example', allow = true): Promise<string> {
  const start = await call('/api/auth/google?return=/art-slide/premium');
  const loc = new URL(start.headers.get('location')!);
  const oauth = cookieOf(start, '__Host-slides_oauth') ?? cookieOf(start, 'slides_oauth')!;
  const nonce = loc.searchParams.get('nonce')!;
  fake.googleClaims = { iss: 'https://accounts.google.com', aud: 'gid', sub: sub_, name, exp: NOW() + 3600, nonce };
  const done = await call(`/api/auth/callback?code=abc&state=${loc.searchParams.get('state')}`, { cookie: oauth });
  expect(done.status).toBe(302);
  expect(done.headers.get('location')).toBe('/art-slide/premium');
  if (allow) { // most tests are about Checkout itself: put this account on the purchase allowlist (the allowlist has its own tests)
    const id = (raw.prepare('SELECT id FROM users WHERE google_sub = ?').get(sub_) as { id: string }).id;
    env = { ...env, PURCHASE_ALLOWLIST: [env.PURCHASE_ALLOWLIST, id].filter(Boolean).join(',') };
  }
  return cookieOf(done, '__Host-slides_session')!;
}

async function webhook(event: object, secret = 'whsec_test', t = NOW()) {
  const body = JSON.stringify(event);
  const sig = `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
  return call('/api/stripe/webhook', { method: 'POST', body, headers: { 'stripe-signature': sig }, origin: null });
}
const subEvent = (id: string, type = 'customer.subscription.updated') => ({ id, type, data: { object: { id: 'sub_1', customer: 'cus_1' } } });
const me = async (cookie: string) => (await call('/api/me', { cookie })).json() as Promise<{ signedIn: boolean; premium: boolean; status?: string; name?: string }>;

beforeEach(() => {
  const m = makeDb();
  raw = m.raw;
  env = baseEnv(m.d1);
  fake = { sub: {}, calls: [], googleClaims: {}, failStripe: false, price: { ...goodPrice }, openSessions: [], createdSessions: 0, missingCustomers: new Set(), livemodeOf: (k) => /_live_/.test(k) };
  fetchFn = makeFetch(fake);
});

describe('pure rules', () => {
  it('Stripe signatures: valid, tampered, wrong secret, stale', async () => {
    const t = NOW();
    const body = '{"id":"evt_1"}';
    const good = `t=${t},v1=${await hmacHex('whsec', `${t}.${body}`)}`;
    expect(await verifyStripeSignature(body, good, 'whsec', t)).toBe(true);
    expect(await verifyStripeSignature(body + ' ', good, 'whsec', t)).toBe(false);
    expect(await verifyStripeSignature(body, good, 'other', t)).toBe(false);
    expect(await verifyStripeSignature(body, good, 'whsec', t + 301)).toBe(false);
    expect(await verifyStripeSignature(body, null, 'whsec', t)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${good.split('v1=')[1]}`, 'whsec', t)).toBe(true); // any matching v1
  });
  it('subscription status -> access', () => {
    const n = 1_000_000;
    const row = (status: string, end: number | null) => ({ status, current_period_end: end, cancel_at_period_end: 0 });
    expect(hasPremium(row('active', n + 100), n)).toBe(true);
    expect(hasPremium(row('trialing', n + 100), n)).toBe(true);
    expect(hasPremium(row('active', n - 10), n)).toBe(true); // late renewal webhook: short grace
    expect(hasPremium(row('active', n - RENEWAL_GRACE_SECONDS - 1), n)).toBe(false);
    expect(hasPremium(row('past_due', n + 100), n)).toBe(true); // already-paid period still runs
    expect(hasPremium(row('past_due', n - 1), n)).toBe(false);
    expect(hasPremium(row('canceled', n + 100), n)).toBe(false); // an ended contract (e.g. cancelled at once) gives no access
    expect(hasPremium(row('canceled', n - 1), n)).toBe(false);
    expect(hasPremium({ ...row('active', n + 100), cancel_at_period_end: 1 }, n)).toBe(true); // cancelled in the portal: paid time is kept until it ends
    expect(hasPremium({ ...row('active', n - 1), cancel_at_period_end: 1 }, n)).toBe(false); // cancelled and the paid period is over: Free at once, even if the 'deleted' webhook is late
    expect(hasPremium({ ...row('active', n + 1), cancel_at_period_end: 1 }, n)).toBe(true); // ...but not a second earlier than the period end
    for (const s of ['unpaid', 'incomplete', 'incomplete_expired', 'paused']) expect(hasPremium(row(s, n + 100), n)).toBe(false);
    expect(hasPremium(null, n)).toBe(false);
  });
  it('ID token claims are checked', () => {
    const c = { iss: 'https://accounts.google.com', aud: 'gid', sub: 's', exp: 200, nonce: 'n' };
    expect(claimsValid(decodeClaims(jwt(c)), 'gid', 'n', 100)).toBe(true);
    expect(claimsValid(decodeClaims(jwt({ ...c, aud: 'other' })), 'gid', 'n', 100)).toBe(false);
    expect(claimsValid(decodeClaims(jwt({ ...c, nonce: 'x' })), 'gid', 'n', 100)).toBe(false);
    expect(claimsValid(decodeClaims(jwt({ ...c, exp: 50 })), 'gid', 'n', 100)).toBe(false);
    expect(claimsValid(decodeClaims(jwt({ ...c, iss: 'https://evil.example' })), 'gid', 'n', 100)).toBe(false);
    expect(claimsValid(null, 'gid', 'n', 100)).toBe(false);
  });
  it('return paths stay on this site; Stripe params are form-encoded', () => {
    expect(safeReturnPath('/art-slide/premium')).toBe('/art-slide/premium');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil', null, '', 'x']) expect(safeReturnPath(bad)).toBe('/');
    expect(formEncode({ mode: 'subscription', line_items: [{ price: 'p', quantity: 1 }], subscription_data: { metadata: { user_id: 'u' } } }).join('&'))
      .toBe('mode=subscription&line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=1&subscription_data%5Bmetadata%5D%5Buser_id%5D=u');
  });
});

describe('configuration', () => {
  it('reports what is set up, and answers 503 for sign-in without it; the site itself is untouched', async () => {
    expect(await (await call('/api/config')).json()).toEqual({ auth: true, billing: true, purchases: true, googleClientId: 'gid' }); // the public client id only, never a secret
    env = { ...env, PURCHASES_ENABLED: 'false' };
    expect(await (await call('/api/config')).json()).toEqual({ auth: true, billing: true, purchases: false, googleClientId: 'gid' });
    const cookie = await login();
    expect((await call('/api/billing/checkout', { method: 'POST', cookie })).status).toBe(503); // switched off on the server
    env = { ...env, PURCHASES_ENABLED: 'true', STRIPE_SECRET_KEY: undefined };
    expect(await (await call('/api/config')).json()).toEqual({ auth: true, billing: false, purchases: false, googleClientId: 'gid' });
    env = { ASSETS: env.ASSETS };
    expect(await (await call('/api/config')).json()).toEqual({ auth: false, billing: false, purchases: false });
    expect((await call('/api/me')).status).toBe(503);
    expect((await call('/api/auth/google')).status).toBe(503);
    expect((await call('/api/stripe/webhook', { method: 'POST', body: '{}', origin: null })).status).toBe(503);
    expect((await call('/api/nope')).status).toBe(404);
  });
});

describe('setup mistakes never reach Stripe', () => {
  it('a product id (prod_…) or any non-price value in STRIPE_PRICE_ID refuses Checkout and says so', async () => {
    const cookie = await login();
    for (const bad of ['prod_ABC123xyz', 'plink_123456', 'price_', 'pk_test_abcdefgh', '', ' price_1Abc23DEF']) {
      env = { ...env, STRIPE_PRICE_ID: bad };
      fake.calls.length = 0;
      const res = await call('/api/billing/checkout', { method: 'POST', cookie });
      expect(res.status, bad).toBe(503);
      expect(await res.json()).toEqual({ error: bad === '' ? 'not_configured' : 'invalid_price_id' });
      expect(fake.calls.filter((c) => c.includes('stripe.com')), bad).toEqual([]); // nothing was sent to Stripe
      expect(raw.prepare('SELECT COUNT(*) AS n FROM stripe_customers').get()).toEqual({ n: 0 }); // no customer was created either
    }
  });
  it('a publishable key in place of the secret key is refused too, and /api/config then reports purchases off', async () => {
    const cookie = await login();
    env = { ...env, STRIPE_SECRET_KEY: 'pk_test_abcdefgh1234' };
    expect((await (await call('/api/billing/checkout', { method: 'POST', cookie })).json())).toEqual({ error: 'invalid_stripe_key' });
    expect(await (await call('/api/config')).json()).toMatchObject({ purchases: false });
    env = { ...env, STRIPE_SECRET_KEY: 'sk_test_x1234567890', STRIPE_PRICE_ID: 'prod_ABC123xyz' };
    expect(await (await call('/api/config')).json()).toMatchObject({ billing: true, purchases: false }); // set, but not usable
  });
  it('a missing webhook secret keeps purchases off, while sign-in and the site keep working', async () => {
    env = { ...env, STRIPE_WEBHOOK_SECRET: undefined };
    expect(await (await call('/api/config')).json()).toMatchObject({ auth: true, billing: false, purchases: false });
    const cookie = await login();
    expect((await me(cookie)).signedIn).toBe(true);
    expect((await call('/api/billing/checkout', { method: 'POST', cookie })).status).toBe(503);
    expect((await call('/api/stripe/webhook', { method: 'POST', body: '{}', origin: null })).status).toBe(503);
  });
  it('the publishable key is never needed or read', async () => {
    env = { ...env, STRIPE_PUBLISHABLE_KEY: undefined } as Env;
    expect(await (await call('/api/config')).json()).toMatchObject({ billing: true, purchases: true });
  });
});

describe('Google sign-in', () => {
  it('uses code flow + PKCE (S256) with state and nonce, and asks only for openid/profile', async () => {
    const res = await call('/api/auth/google?return=//evil.example');
    const u = new URL(res.headers.get('location')!);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')!.length).toBeGreaterThan(30);
    expect(u.searchParams.get('scope')).toBe('openid profile');
    expect(u.searchParams.get('redirect_uri')).toBe(`${SITE}/api/auth/callback`);
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(u.searchParams.get('nonce')).toBeTruthy();
    const setCookie = res.headers.getSetCookie().join('\n');
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Lax/);
  });

  it('completes the login, sets a Secure HttpOnly session cookie and stores only a hash of it', async () => {
    const cookie = await login();
    expect(cookie).toMatch(/^__Host-slides_session=/);
    expect(await me(cookie)).toMatchObject({ signedIn: true, premium: false, name: 'Ann Example', googleSub: 'google-sub-1' });
    const stored = raw.prepare('SELECT id FROM sessions').all() as { id: string }[];
    expect(stored).toHaveLength(1);
    expect(cookie).not.toContain(stored[0].id);
    const users = raw.prepare('SELECT google_sub, name FROM users').all();
    expect(users).toEqual([{ google_sub: 'google-sub-1', name: 'Ann Example' }]);
  });

  it('rejects a wrong state, a wrong nonce, a missing cookie and a denied consent', async () => {
    const start = await call('/api/auth/google');
    const loc = new URL(start.headers.get('location')!);
    const oauth = cookieOf(start, '__Host-slides_oauth') ?? cookieOf(start, 'slides_oauth')!;
    fake.googleClaims = { iss: 'https://accounts.google.com', aud: 'gid', sub: 'x', exp: NOW() + 60, nonce: loc.searchParams.get('nonce') };
    const bad = async (q: string, cookie?: string) => (await call(`/api/auth/callback?${q}`, { cookie })).headers.get('location');
    expect(await bad('code=c&state=WRONG', oauth)).toBe('/?auth=invalid');
    expect(await bad(`code=c&state=${loc.searchParams.get('state')}`)).toBe('/?auth=invalid'); // no cookie
    expect(await bad('error=access_denied', oauth)).toBe('/?auth=denied');
    fake.googleClaims.nonce = 'other';
    expect(await bad(`code=c&state=${loc.searchParams.get('state')}`, oauth)).toBe('/?auth=invalid');
    expect(raw.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
  });

  it('limits login attempts per address', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 42; i++) codes.push((await call('/api/auth/google', { headers: { 'cf-connecting-ip': '203.0.113.9' } })).status);
    expect(codes.slice(0, 40).every((c) => c === 302)).toBe(true);
    expect(codes.slice(40)).toEqual([429, 429]);
    expect((await call('/api/auth/google', { headers: { 'cf-connecting-ip': '203.0.113.10' } })).status).toBe(302); // others are unaffected
  });

  it('never keeps an IP address: only a keyed hash, and old counters are deleted', async () => {
    await call('/api/auth/google', { headers: { 'cf-connecting-ip': '203.0.113.77' } });
    const keys = (raw.prepare('SELECT key FROM rate_limits').all() as { key: string }[]).map((r) => r.key);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^auth:[0-9a-f]{32}$/);
    expect(JSON.stringify(keys)).not.toContain('203.0.113.77');
    raw.prepare("INSERT INTO rate_limits VALUES ('auth:old', ?, 3)").run(NOW() - 3 * 86400);
    await call('/api/auth/google', { headers: { 'cf-connecting-ip': '198.51.100.5' } }); // a new window starts: housekeeping runs
    expect((raw.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key = 'auth:old'").get() as { n: number }).n).toBe(0);
  });

  it('logout needs a request from our own site and ends the session', async () => {
    const cookie = await login();
    expect((await call('/api/auth/logout', { method: 'POST', cookie, origin: 'https://evil.example' })).status).toBe(403);
    expect((await me(cookie)).signedIn).toBe(true);
    expect((await call('/api/auth/logout', { method: 'POST', cookie })).status).toBe(200);
    expect((await me(cookie)).signedIn).toBe(false);
  });
});

describe('Checkout and portal', () => {
  it('needs a session and a same-site request', async () => {
    expect((await call('/api/billing/checkout', { method: 'POST' })).status).toBe(401);
    const cookie = await login();
    expect((await call('/api/billing/checkout', { method: 'POST', cookie, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('/api/billing/checkout', { method: 'POST', cookie, origin: null })).status).toBe(403);
    expect((await call('/api/billing/checkout', { cookie })).status).toBe(405);
  });

  it('creates a customer tied to the account and a subscription Checkout; Premium is NOT granted by it', async () => {
    const cookie = await login();
    const res = await call('/api/billing/checkout', { method: 'POST', cookie });
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/c/1' });
    expect(raw.prepare('SELECT livemode, customer_id FROM stripe_customers').get()).toEqual({ livemode: 0, customer_id: 'cus_1' }); // filed under the key's mode (test)
    expect(raw.prepare('SELECT stripe_customer_id FROM users').get()).toEqual({ stripe_customer_id: null }); // the old column is no longer written
    expect((await me(cookie)).premium).toBe(false); // only a verified subscription grants it
    // calling again reuses the customer
    await call('/api/billing/checkout', { method: 'POST', cookie });
    expect(fake.calls.filter((c) => c === 'POST https://api.stripe.com/v1/customers')).toHaveLength(1);
  });

  it('refuses a second contract and opens the customer portal for an existing customer', async () => {
    const cookie = await login();
    await call('/api/billing/checkout', { method: 'POST', cookie });
    const uid = (raw.prepare('SELECT id FROM users').get() as { id: string }).id;
    fake.sub = sub({ metadata: { user_id: uid } });
    expect((await webhook({ id: 'evt_a', type: 'customer.subscription.created', data: { object: { id: 'sub_1', customer: 'cus_1' } } })).status).toBe(200);
    expect((await call('/api/billing/checkout', { method: 'POST', cookie })).status).toBe(409);
    expect(await (await call('/api/billing/portal', { method: 'POST', cookie })).json()).toEqual({ url: 'https://billing.stripe.test/p/1' });
  });

  it('limits how often the billing endpoints can be called: a burst of 8 a minute, every request counted', async () => {
    const cookie = await login();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await call('/api/billing/checkout', { method: 'POST', cookie })).status);
    expect(codes.slice(0, 8).every((c) => c === 200)).toBe(true);
    expect(codes.slice(8)).toEqual([429, 429, 429, 429]);
  });
});

describe('billing rate limits (what a normal buyer does must never lock them out)', () => {
  const uidOf = () => (raw.prepare('SELECT id FROM users').get() as { id: string }).id;
  const row = (key: string) => raw.prepare('SELECT count, window_start AS start FROM rate_limits WHERE key = ?').get(key) as { count: number; start: number } | undefined;
  /** the one-minute burst counter is reset so that the HOURLY allowance can be looked at on its own */
  const clearBurst = () => raw.prepare("DELETE FROM rate_limits WHERE key LIKE 'billing-burst:%'").run();
  const co = (cookie: string) => call('/api/billing/checkout', { method: 'POST', cookie });
  const portal = (cookie: string) => call('/api/billing/portal', { method: 'POST', cookie });

  it('attempts that fail before a payment page is created (setup problem) do not use up the hourly allowance', async () => {
    env = { ...env, STRIPE_PRICE_ID: 'price_NeverCheckedBefore1' }; // not in the 5-minute price cache
    fake.price = { ...fake.price, active: false };
    const cookie = await login();
    for (let i = 0; i < 25; i++) { clearBurst(); expect((await co(cookie)).status).toBe(503); } // 25 failed clicks: never 429
    expect(row(`checkout:${uidOf()}`)).toBeUndefined();
    fake.price = { ...fake.price, active: true };
    priceCheckedReset();
    clearBurst();
    expect((await co(cookie)).status).toBe(200); // the first good click works at once
  });

  it('already subscribed (409) does not use it up either', async () => {
    const cookie = await login();
    await co(cookie);
    fake.sub = sub({ metadata: { user_id: uidOf() } });
    await webhook({ id: 'evt_a', type: 'customer.subscription.created', data: { object: { id: 'sub_1', customer: 'cus_1' } } });
    const used = row(`checkout:${uidOf()}`)?.count ?? 0;
    for (let i = 0; i < 25; i++) { clearBurst(); expect((await co(cookie)).status).toBe(409); }
    expect(row(`checkout:${uidOf()}`)?.count ?? 0).toBe(used);
  });

  it('when Stripe itself fails the hit is given back', async () => {
    const cookie = await login();
    const real = fetchFn;
    fetchFn = async (input, init) => (input.endsWith('/v1/checkout/sessions') && init?.method === 'POST' ? new Response('{"error":{"type":"api_error"}}', { status: 500 }) : real(input, init));
    for (let i = 0; i < 25; i++) { clearBurst(); await expect(co(cookie)).rejects.toThrow('Stripe API 500'); } // (in production the Worker's wrapper answers server_error; never rate_limited)
    expect(row(`checkout:${uidOf()}`)?.count ?? 0).toBe(0);
    fetchFn = real;
    clearBurst();
    expect((await co(cookie)).status).toBe(200);
  });

  it('payment pages that really are created are limited to 20 an hour, and it ends when the hour does', async () => {
    const cookie = await login();
    const codes: number[] = [];
    for (let i = 0; i < 22; i++) { clearBurst(); codes.push((await co(cookie)).status); }
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes.slice(20)).toEqual([429, 429]);
    // the window is fixed: an hour after it started the counter starts again by itself (nothing stays locked)
    raw.prepare('UPDATE rate_limits SET window_start = window_start - 3601 WHERE key = ?').run(`checkout:${uidOf()}`);
    clearBurst();
    expect((await co(cookie)).status).toBe(200);
    expect(row(`checkout:${uidOf()}`)!.count).toBe(1);
  });

  it('the portal has its own allowance, and Checkout does not eat it', async () => {
    const cookie = await login();
    await co(cookie);
    fileCustomer(uidOf(), 'cus_1');
    for (let i = 0; i < 19; i++) { clearBurst(); expect((await co(cookie)).status).toBe(200); } // (+ the first one above = 20)
    clearBurst();
    expect((await co(cookie)).status).toBe(429); // checkout is spent for the hour ...
    clearBurst();
    expect((await portal(cookie)).status).toBe(200); // ... but the account can still open the portal
  });

  it('an old counter left by the previous version (billing:<id>) does not block anyone', async () => {
    const cookie = await login();
    raw.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 10)').run(`billing:${uidOf()}`, NOW());
    expect((await co(cookie)).status).toBe(200);
  });

  it('the limits are per account: one buyer in a burst does not slow another; Google sign-in has its own counter', async () => {
    const a = await login('sub-r1', 'R1');
    const b = await login('sub-r2', 'R2');
    fake.nextCustomer = 'cus_b'; // (the fake Stripe hands out the next customer id)
    for (let i = 0; i < 10; i++) await co(a);
    expect((await co(a)).status).toBe(429);
    expect((await co(b)).status).toBe(200);
    for (let i = 0; i < 40; i++) await call('/api/auth/google', { headers: { 'cf-connecting-ip': '198.51.100.7' } });
    expect((await call('/api/auth/google', { headers: { 'cf-connecting-ip': '198.51.100.7' } })).status).toBe(429); // the sign-in limiter (by address)
    clearBurst();
    expect((await co(b)).status).toBe(200); // and it does not touch the billing counters
    const keys = (raw.prepare('SELECT key FROM rate_limits').all() as { key: string }[]).map((r) => r.key.split(':')[0]);
    expect(new Set(keys)).toEqual(new Set(['billing-burst', 'checkout', 'auth']));
  });

  it('the answer is the app\u2019s own JSON 429, and Stripe is not called when it limits', async () => {
    const cookie = await login();
    for (let i = 0; i < 8; i++) await co(cookie);
    const before = fake.calls.length;
    const r = await co(cookie);
    expect(r.status).toBe(429);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(await r.json()).toEqual({ error: 'rate_limited' });
    expect(fake.calls.length).toBe(before); // refused before anything was sent to Stripe
  });
});

describe('Stripe webhook', () => {
  async function subscribed() {
    const cookie = await login();
    await call('/api/billing/checkout', { method: 'POST', cookie });
    const uid = (raw.prepare('SELECT id FROM users').get() as { id: string }).id;
    fake.sub = sub({ metadata: { user_id: uid } });
    return { cookie, uid };
  }

  it('rejects a bad or missing signature and bad bodies', async () => {
    expect((await webhook(subEvent('evt_1'), 'wrong_secret')).status).toBe(400);
    expect((await webhook(subEvent('evt_1'), 'whsec_test', NOW() - 4000)).status).toBe(400);
    expect((await call('/api/stripe/webhook', { method: 'POST', body: '{}', origin: null })).status).toBe(400);
    expect((await call('/api/stripe/webhook', { method: 'GET' })).status).toBe(405);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM stripe_events').get()).toEqual({ n: 0 });
  });

  it('a paid checkout turns Premium on; the browser flag is not involved', async () => {
    const { cookie, uid } = await subscribed();
    const res = await webhook({ id: 'evt_c', type: 'checkout.session.completed', data: { object: { subscription: 'sub_1', customer: 'cus_1', client_reference_id: uid } } });
    expect(res.status).toBe(200);
    expect(await me(cookie)).toMatchObject({ premium: true, status: 'active' });
  });

  it('handles a repeated delivery once', async () => {
    await subscribed();
    const ev = subEvent('evt_dup');
    expect(await (await webhook(ev)).json()).toEqual({ received: true });
    const stripeCalls = fake.calls.length;
    expect(await (await webhook(ev)).json()).toEqual({ received: true, duplicate: true });
    expect(fake.calls.length).toBe(stripeCalls); // nothing was processed again
    expect(raw.prepare('SELECT COUNT(*) AS n FROM stripe_events').get()).toEqual({ n: 1 });
  });

  it('cancelling keeps Premium until the paid period ends, then returns to Free', async () => {
    const { cookie } = await subscribed();
    await webhook(subEvent('evt_1'));
    fake.sub = { ...fake.sub, cancel_at_period_end: true };
    await webhook(subEvent('evt_2'));
    expect(await me(cookie)).toMatchObject({ premium: true });
    expect(raw.prepare('SELECT cancel_at_period_end AS c FROM stripe_subscriptions').get()).toEqual({ c: 1 });
    fake.sub = { ...fake.sub, status: 'canceled', current_period_end: NOW() - 60 };
    await webhook(subEvent('evt_3', 'customer.subscription.deleted'));
    expect((await me(cookie)).premium).toBe(false);
  });

  it('a failed payment, unpaid and incomplete states', async () => {
    const { cookie } = await subscribed();
    fake.sub = { ...fake.sub, status: 'past_due' };
    await webhook({ id: 'evt_f', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1' } } });
    expect(await me(cookie)).toMatchObject({ status: 'past_due', premium: true }); // paid period still running
    fake.sub = { ...fake.sub, status: 'past_due', current_period_end: NOW() - 10 };
    await webhook(subEvent('evt_g'));
    expect((await me(cookie)).premium).toBe(false);
    fake.sub = { ...fake.sub, status: 'unpaid', current_period_end: NOW() + 1000 };
    await webhook(subEvent('evt_h'));
    expect((await me(cookie)).premium).toBe(false);
    fake.sub = { ...fake.sub, status: 'incomplete', current_period_end: NOW() + 1000 };
    await webhook(subEvent('evt_i'));
    expect((await me(cookie)).premium).toBe(false);
  });

  it('newer API shape: invoice events carry the subscription under parent, period end on the items', async () => {
    const { cookie } = await subscribed();
    const { current_period_end, ...rest } = fake.sub as { current_period_end: number };
    fake.sub = { ...rest, items: { data: [{ current_period_end }] } };
    await webhook({ id: 'evt_n', type: 'invoice.paid', data: { object: { parent: { subscription_details: { subscription: 'sub_1' } } } } });
    expect(await me(cookie)).toMatchObject({ premium: true });
  });

  it('a failure while processing answers 500 and is retried successfully; unrelated events are acknowledged', async () => {
    const { cookie } = await subscribed();
    fake.failStripe = true;
    expect((await webhook(subEvent('evt_r'))).status).toBe(500);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM stripe_events').get()).toEqual({ n: 0 }); // not recorded
    fake.failStripe = false;
    expect((await webhook(subEvent('evt_r'))).status).toBe(200);
    expect((await me(cookie)).premium).toBe(true);
    expect((await webhook({ id: 'evt_x', type: 'charge.refunded', data: { object: {} } })).status).toBe(200);
  });

  it('never attaches a subscription of another Stripe customer to an account', async () => {
    const { cookie, uid } = await subscribed();
    fake.sub = sub({ metadata: { user_id: uid }, customer: 'cus_someone_else' });
    expect((await webhook(subEvent('evt_m'))).status).toBe(200);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM stripe_subscriptions').get()).toEqual({ n: 0 });
    expect((await me(cookie)).premium).toBe(false);
  });

  it('ignores a subscription that belongs to nobody here', async () => {
    fake.sub = sub({ metadata: {}, customer: 'cus_unknown' });
    expect((await webhook({ id: 'evt_u', type: 'customer.subscription.created', data: { object: { id: 'sub_1', customer: 'cus_unknown' } } })).status).toBe(200);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM stripe_subscriptions').get()).toEqual({ n: 0 });
  });

  it('re-reads Stripe when a stored period has run out (missed webhook): renewed -> Premium, ended -> Free', async () => {
    const { cookie, uid } = await subscribed();
    const stale = () => raw.prepare('INSERT OR REPLACE INTO stripe_subscriptions VALUES (?, 0, ?, ?, ?, 0, ?)').run(uid, 'sub_1', 'active', NOW() - 5 * 86400, NOW() - 3600);
    stale();
    expect((await me(cookie)).premium).toBe(true); // Stripe says it was renewed: the stored row is corrected
    expect((raw.prepare('SELECT current_period_end AS e FROM stripe_subscriptions').get() as { e: number }).e).toBeGreaterThan(NOW());
    stale();
    fake.sub = { ...fake.sub, status: 'canceled', current_period_end: NOW() - 86400 };
    expect((await me(cookie)).premium).toBe(false); // Stripe says it ended
  });

  it('after Checkout the page can ask for a fresh check instead of waiting for the webhook', async () => {
    const { cookie } = await subscribed();
    expect((await me(cookie)).premium).toBe(false); // nothing stored yet
    const r = await call('/api/billing/status?refresh=1', { cookie });
    expect(await r.json()).toMatchObject({ premium: true, status: 'active' });
  });
});

describe('Checkout safety: price, mode and double purchase', () => {
  const co = (cookie: string) => call('/api/billing/checkout', { method: 'POST', cookie });
  const posted = () => fake.calls.filter((c) => c.startsWith('POST https://api.stripe.com'));

  it.each([
    ['another amount', { unit_amount: 500 }, 'price_wrongAmt01'],
    ['another currency', { currency: 'usd' }, 'price_wrongCur01'],
    ['yearly', { recurring: { interval: 'year', interval_count: 1 } }, 'price_yearly0001'],
    ['one-time', { type: 'one_time', recurring: null }, 'price_onetime001'],
    ['archived', { active: false }, 'price_archived01'],
    ['a LIVE price with a test key', { livemode: true }, 'price_livemode01'],
  ])('%s: refused before anything is created', async (_n, over, id) => {
    const cookie = await login();
    env = { ...env, STRIPE_PRICE_ID: id };
    fake.price = { ...goodPrice, ...over };
    const res = await co(cookie);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/^price_/);
    expect(posted()).toEqual([]); // no customer, no Checkout session
    expect(fake.createdSessions).toBe(0);
  });

  it('the exact ¥200/month price in the key\'s mode works', async () => {
    const cookie = await login();
    env = { ...env, STRIPE_PRICE_ID: 'price_exactGood01' };
    expect((await co(cookie)).status).toBe(200);
    expect(fake.createdSessions).toBe(1);
  });

  it('a live key is refused unless real payments were switched on separately', async () => {
    const cookie = await login();
    env = { ...env, STRIPE_SECRET_KEY: 'sk_live_abcdefghijk1', STRIPE_PRICE_ID: 'price_liveGood001' };
    fake.price = { ...goodPrice, livemode: true };
    expect(await (await co(cookie)).json()).toEqual({ error: 'live_key_not_allowed' });
    expect(await (await call('/api/config')).json()).toMatchObject({ purchases: false });
    expect(fake.calls).toEqual(expect.not.arrayContaining([expect.stringContaining('/v1/prices/')]));
    env = { ...env, ALLOW_LIVE_PAYMENTS: 'true' };
    expect((await co(cookie)).status).toBe(200);
    expect(await (await call('/api/config')).json()).toMatchObject({ purchases: true });
  });

  it('an existing subscription at Stripe blocks a second Checkout even before the webhook reached D1', async () => {
    const cookie = await login();
    env = { ...env, STRIPE_PRICE_ID: 'price_lagGood0001' };
    await co(cookie); // creates the Stripe customer
    const uid = (raw.prepare('SELECT id FROM users').get() as { id: string }).id;
    fake.sub = sub({ metadata: { user_id: uid } }); // paid at Stripe; no webhook yet
    expect(raw.prepare('SELECT COUNT(*) AS n FROM stripe_subscriptions').get()).toEqual({ n: 0 });
    fake.createdSessions = 0;
    const res = await co(cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_subscribed' });
    expect(fake.createdSessions).toBe(0);
    expect((await me(cookie)).premium).toBe(true); // and D1 was brought up to date on the way
  });

  it('a payment still pending (3-D Secure not finished) blocks a second Checkout', async () => {
    const cookie = await login();
    env = { ...env, STRIPE_PRICE_ID: 'price_pendGood001' };
    await co(cookie);
    fake.sub = sub({ status: 'incomplete' });
    expect(await (await co(cookie)).json()).toEqual({ error: 'payment_pending' });
  });

  it('only one payment page can be open: an earlier open one is expired first', async () => {
    const cookie = await login();
    env = { ...env, STRIPE_PRICE_ID: 'price_openGood0001' };
    fake.openSessions = [{ id: 'cs_old_1' }, { id: 'cs_old_2' }];
    expect((await co(cookie)).status).toBe(200);
    expect(fake.calls.filter((c) => c.includes('/expire')).length).toBe(2);
    expect(fake.openSessions).toEqual([]);
    expect(fake.createdSessions).toBe(1);
  });

  it('a second subscription (paid twice by mistake) never replaces the first and is reported', async () => {
    const cookie = await login();
    env = { ...env, STRIPE_PRICE_ID: 'price_dupGood00001' };
    await co(cookie);
    const uid = (raw.prepare('SELECT id FROM users').get() as { id: string }).id;
    fake.sub = sub({ id: 'sub_1', metadata: { user_id: uid } });
    await webhook(subEvent('evt_first'));
    const first = raw.prepare('SELECT stripe_subscription_id AS id FROM stripe_subscriptions').get();
    expect(first).toEqual({ id: 'sub_1' });
    // a second one appears at Stripe
    const second = sub({ id: 'sub_2', metadata: { user_id: uid } });
    const spy: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { spy.push(String(a[0])); };
    const saved = fake.sub;
    fake.sub = second;
    const f2: FetchFn = async (input, init) => (String(input).includes('/subscriptions/sub_2') ? new Response(JSON.stringify(second)) : fetchFn(input, init));
    const body = JSON.stringify({ id: 'evt_second', type: 'customer.subscription.created', data: { object: { id: 'sub_2', customer: 'cus_1' } } });
    const t = NOW();
    const sig = `t=${t},v1=${await hmacHex('whsec_test', `${t}.${body}`)}`;
    const res = await handle(new Request(`${SITE}/api/stripe/webhook`, { method: 'POST', body, headers: { 'stripe-signature': sig } }), env, { fetchFn: f2 });
    console.error = orig;
    fake.sub = saved;
    expect(res.status).toBe(200);
    expect(raw.prepare('SELECT stripe_subscription_id AS id FROM stripe_subscriptions').get()).toEqual({ id: 'sub_1' }); // the first one stays
    expect(spy.some((m) => m.startsWith('duplicate_subscription'))).toBe(true);
    expect((await me(cookie)).premium).toBe(true);
  });
});

describe('full-size paintings (Premium enforcement)', () => {
  const locked = () => ARTWORKS.find((a) => !FREE_ARTWORK_IDS.includes(a.id) && !isDailyImage(a.id))!.id;
  const img = (id: string, cookie?: string, suffix = '') => worker.fetch(new Request(`${SITE}/artworks/${id}${suffix}.webp`, { headers: cookie ? { cookie } : {} }), env);

  async function premiumCookie() {
    const cookie = await login();
    await call('/api/billing/checkout', { method: 'POST', cookie });
    const uid = (raw.prepare("SELECT id FROM users WHERE google_sub = 'google-sub-1'").get() as { id: string }).id;
    fake.sub = sub({ metadata: { user_id: uid } });
    await webhook(subEvent('evt_img'));
    return cookie;
  }

  it('recognises full-size images only (not thumbnails or other files)', () => {
    expect(fullImageId('/artworks/van-gogh-bedroom.webp')).toBe('van-gogh-bedroom');
    expect(fullImageId('/artworks/van-gogh-bedroom-thumb.webp')).toBeNull();
    expect(fullImageId('/artworks/../api/me.webp')).toBeNull();
    expect(fullImageId('/artworks/x.png')).toBeNull();
    expect(fullImageId('/og/van-gogh-bedroom.jpg')).toBeNull();
  });

  it('while enforcement is OFF every image passes straight through (the site as it is today)', async () => {
    env = { ...env, PREMIUM_ENFORCED: undefined };
    const res = await img(locked());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('asset');
  });

  it('when ON: Free paintings and today\'s daily are open to everyone; Premium paintings are not', async () => {
    env = { ...env, PREMIUM_ENFORCED: 'true' };
    expect((await img(FREE_ARTWORK_IDS[0])).status).toBe(200);
    const todayId = (await import('../src/games/art-slide/logic/dailyPick')).dailyArtworkId((await import('../src/utils/date')).jstDateKey());
    expect((await img(todayId)).status).toBe(200);
    const res = await img(locked());
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).not.toBe('asset');
  });

  it('when ON: a signed-in Free account is refused, a Premium account gets the image, privately cached', async () => {
    env = { ...env, PREMIUM_ENFORCED: 'true' };
    const freeCookie = await login('free-sub', 'Free Person');
    expect((await img(locked(), freeCookie)).status).toBe(403);
    const cookie = await premiumCookie();
    const ok = await img(locked(), cookie);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('asset');
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
    expect((await img(locked())).status).toBe(403); // and still not without the cookie
  });

  it('when ON: a verified StoreKit entitlement linked to the Web account gets the same private image access', async () => {
    env = { ...env, PREMIUM_ENFORCED: 'true' };
    const cookie = await login('apple-only-google-sub');
    const userId = (raw.prepare('SELECT id FROM users WHERE google_sub = ?').get('apple-only-google-sub') as { id: string }).id;
    // This represents the row written only after the signed StoreKit
    // transaction was verified by /api/apple/entitlement.
    raw.exec(readFileSync(new URL('../migrations/0003_apple_accounts.sql', import.meta.url), 'utf8'));
    raw.exec(readFileSync(new URL('../migrations/0004_shared_entitlements.sql', import.meta.url), 'utf8'));
    raw.prepare('INSERT INTO apple_accounts (id, apple_sub, created_at) VALUES (?, ?, ?)').run('apple-account-1', 'apple-sub-1', NOW());
    raw.prepare('INSERT INTO apple_account_links (apple_account_id, user_id, linked_at) VALUES (?, ?, ?)').run('apple-account-1', userId, NOW());
    raw.prepare('INSERT INTO apple_entitlements (original_transaction_id, apple_account_id, expires_ms, revoked, updated_at) VALUES (?, ?, ?, 0, ?)')
      .run('original-transaction-1', 'apple-account-1', Date.now() + 3_600_000, Date.now());
    const ok = await img(locked(), cookie);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
  });

  it('when ON: an ended contract loses access; an unconfigured backend never hands out Premium images', async () => {
    env = { ...env, PREMIUM_ENFORCED: 'true' };
    const cookie = await premiumCookie();
    expect((await img(locked(), cookie)).status).toBe(200);
    fake.sub = { ...fake.sub, status: 'canceled', current_period_end: NOW() + 100000 };
    await webhook(subEvent('evt_img2', 'customer.subscription.deleted'));
    expect((await img(locked(), cookie)).status).toBe(403);
    env = { ASSETS: env.ASSETS, PREMIUM_ENFORCED: 'true' };
    expect((await img(locked(), cookie)).status).toBe(403);
  });

  it('when ON and the database fails, it fails closed (503), never open', async () => {
    env = { ...env, PREMIUM_ENFORCED: 'true' };
    const cookie = await login();
    env = { ...env, DB: { prepare: () => { throw new Error('d1 down'); }, batch: async () => [] } as never };
    const res = await img(locked(), cookie);
    expect(res.status).toBe(503);
  });
});

describe('contract end', () => {
  it('an immediate cancellation (e.g. by the operator) ends Premium at once; a scheduled end keeps it and is shown as cancelling', async () => {
    const cookie = await login();
    await call('/api/billing/checkout', { method: 'POST', cookie });
    const uid = (raw.prepare('SELECT id FROM users').get() as { id: string }).id;
    fake.sub = sub({ metadata: { user_id: uid }, cancel_at: NOW() + 10 * 86400 }); // scheduled end, no cancel_at_period_end flag
    await webhook(subEvent('evt_s1'));
    expect(await (await call('/api/me', { cookie })).json()).toMatchObject({ premium: true, cancelAtPeriodEnd: true });
    fake.sub = { ...fake.sub, status: 'canceled', cancel_at: null }; // cancelled right now, a paid period would still remain
    await webhook(subEvent('evt_s2', 'customer.subscription.deleted'));
    expect(await me(cookie)).toMatchObject({ premium: false, status: 'canceled' });
  });
});

describe('account deletion', () => {
  it('ends an open subscription, removes the account and its sessions', async () => {
    const cookie = await login();
    await call('/api/billing/checkout', { method: 'POST', cookie });
    const uid = (raw.prepare('SELECT id FROM users').get() as { id: string }).id;
    fake.sub = sub({ metadata: { user_id: uid } });
    await webhook(subEvent('evt_d'));
    expect((await call('/api/account/delete', { method: 'POST', cookie, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('/api/account/delete', { method: 'POST', cookie })).status).toBe(200);
    expect(fake.calls).toContain('DELETE https://api.stripe.com/v1/subscriptions/sub_1');
    for (const t of ['users', 'subscriptions', 'stripe_subscriptions', 'stripe_customers', 'sessions']) expect(raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual({ n: 0 });
    expect((await me(cookie)).signedIn).toBe(false);
  });

  it('does not delete while the subscription could not be cancelled', async () => {
    const cookie = await login();
    await call('/api/billing/checkout', { method: 'POST', cookie });
    const uid = (raw.prepare('SELECT id FROM users').get() as { id: string }).id;
    fake.sub = sub({ metadata: { user_id: uid } });
    await webhook(subEvent('evt_e'));
    fake.failStripe = true;
    expect((await call('/api/account/delete', { method: 'POST', cookie })).status).toBe(502);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 });
  });
});

describe('purchase allowlist (limited live test: only listed accounts may start a Checkout)', () => {
  const ids = (cookieSub: string) => (raw.prepare('SELECT id FROM users WHERE google_sub = ?').get(cookieSub) as { id: string }).id;
  const co = (cookie: string) => call('/api/billing/checkout', { method: 'POST', cookie });

  it('parses only a well-formed list: unset, empty, blank, a bad entry or too many entries mean NOBODY', () => {
    expect(parseAllowlist(undefined)).toBeNull();
    expect(parseAllowlist('')).toBeNull();
    expect(parseAllowlist('  ,  ')).toBeNull();
    expect(parseAllowlist('short')).toBeNull(); // not an account id
    expect(parseAllowlist('aaaaaaaa-1111, bad entry!')).toBeNull(); // one bad entry spoils the whole list
    expect(parseAllowlist('*')).toBeNull(); // no wildcard: "everybody" needs a deliberate change in code
    expect(parseAllowlist(Array.from({ length: ALLOWLIST_MAX + 1 }, (_, i) => `id-${String(i).padStart(8, '0')}`).join(','))).toBeNull();
    expect([...parseAllowlist('aaaaaaaa-1111,bbbbbbbb-2222 cccccccc-3333\n')!]).toEqual(['aaaaaaaa-1111', 'bbbbbbbb-2222', 'cccccccc-3333']);
    expect(purchaseAllowed({ ...env, PURCHASE_ALLOWLIST: 'aaaaaaaa-1111' }, 'aaaaaaaa-1111')).toBe(true);
    expect(purchaseAllowed({ ...env, PURCHASE_ALLOWLIST: 'aaaaaaaa-1111' }, 'aaaaaaaa-11')).toBe(false);
  });

  it('an account on the list can start a Checkout; an account that is not gets 403 and nothing reaches Stripe', async () => {
    env = { ...env, PURCHASE_ALLOWLIST: undefined };
    const ok = await login('sub-ok', 'Ok', true);
    const other = await login('sub-other', 'Other', false);
    const before = fake.calls.length;
    const denied = await co(other);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: 'not_allowed' });
    expect(fake.calls.length).toBe(before); // no customer, no price lookup, no session
    expect(fake.createdSessions).toBe(0);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM stripe_customers WHERE user_id = ?').get(ids('sub-other'))).toEqual({ n: 0 });
    const allowed = await co(ok);
    expect(allowed.status).toBe(200);
    expect((await allowed.json() as { url: string }).url).toContain('checkout.stripe.test');
    expect(fake.createdSessions).toBe(1);
    expect((await co(other)).status).toBe(403); // still refused after the other one bought
  });

  it('unset, empty or malformed allowlist: everybody is refused (403), even a signed-in account', async () => {
    const cookie = await login('sub-a', 'A', false);
    const id = ids('sub-a');
    for (const bad of [undefined, '', '   ', ',', '*', `${id},not valid!`, 'x']) {
      env = { ...env, PURCHASE_ALLOWLIST: bad };
      const r = await co(cookie);
      expect(r.status, JSON.stringify(bad)).toBe(403);
      expect(fake.createdSessions).toBe(0);
    }
    env = { ...env, PURCHASE_ALLOWLIST: id };
    expect((await co(cookie)).status).toBe(200); // the same account passes once it is listed
  });

  it('not signed in: 401; a cross-site request: 403; PURCHASES_ENABLED off: 503 even for a listed account', async () => {
    const cookie = await login('sub-b', 'B', true);
    expect((await call('/api/billing/checkout', { method: 'POST' })).status).toBe(401);
    expect((await call('/api/billing/checkout', { method: 'POST', cookie, origin: 'https://evil.example' })).status).toBe(403);
    env = { ...env, PURCHASES_ENABLED: 'false' };
    expect((await co(cookie)).status).toBe(503);
    expect(fake.createdSessions).toBe(0);
  });

  it('a live key still needs ALLOW_LIVE_PAYMENTS, listed or not', async () => {
    const cookie = await login('sub-c', 'C', true);
    env = { ...env, STRIPE_SECRET_KEY: 'rk_live_abcdefghijkl' };
    expect(await (await co(cookie)).json()).toEqual({ error: 'live_key_not_allowed' });
    expect(fake.createdSessions).toBe(0);
  });

  it('/api/me tells the signed-in person whether THEY may buy, and never reveals the list', async () => {
    const listed = await login('sub-d', 'D', true);
    const unlisted = await login('sub-e', 'E', false);
    const meOf = async (c: string) => (await call('/api/me', { cookie: c })).json() as Promise<{ canPurchase?: boolean; id?: string }>;
    expect((await meOf(listed)).canPurchase).toBe(true);
    expect((await meOf(unlisted)).canPurchase).toBe(false);
    expect(JSON.stringify(await meOf(unlisted))).not.toContain(ids('sub-d')); // another account's id is never shown
    env = { ...env, PURCHASES_ENABLED: 'false' };
    expect((await meOf(listed)).canPurchase).toBe(false); // purchases off: nobody
    env = { ...env, PURCHASES_ENABLED: 'true', PURCHASE_ALLOWLIST: undefined };
    expect((await meOf(listed)).canPurchase).toBe(false); // list unset: nobody
    expect((await (await call('/api/me')).json())).toEqual({ signedIn: false, premium: false }); // anonymous: nothing at all
    expect(await (await call('/api/config')).json()).not.toHaveProperty('canPurchase');
  });

  it('the portal (to cancel) is not limited by the list: a subscriber can always manage and cancel', async () => {
    const cookie = await login('sub-f', 'F', true);
    expect((await co(cookie)).status).toBe(200);
    env = { ...env, PURCHASE_ALLOWLIST: undefined, PURCHASES_ENABLED: 'false' };
    const r = await call('/api/billing/portal', { method: 'POST', cookie });
    expect(r.status).toBe(200);
  });
});

describe('general sales mode (PUBLIC_SALES=open)', () => {
  const co = (cookie: string) => call('/api/billing/checkout', { method: 'POST', cookie });
  const meOf = async (c: string) => (await call('/api/me', { cookie: c })).json() as Promise<{ canPurchase?: boolean }>;

  it('only the exact text "open" turns it on; anything else keeps the allowlist in force', () => {
    expect(publicSalesOpen({ ...env, PUBLIC_SALES: 'open' })).toBe(true);
    for (const v of [undefined, '', 'true', 'TRUE', '1', 'yes', 'on', 'OPEN', 'Open', ' open', 'open ', '*', 'all']) expect(publicSalesOpen({ ...env, PUBLIC_SALES: v }), JSON.stringify(v)).toBe(false);
    expect(purchaseAllowed({ ...env, PUBLIC_SALES: 'true', PURCHASE_ALLOWLIST: undefined }, 'someone-1234')).toBe(false); // a wrong value is "closed", not "open"
    expect(purchaseAllowed({ ...env, PUBLIC_SALES: 'open', PURCHASE_ALLOWLIST: undefined }, 'someone-1234')).toBe(true);
  });

  it('open: every signed-in account can start a Checkout, with no allowlist at all', async () => {
    env = { ...env, PUBLIC_SALES: 'open', PURCHASE_ALLOWLIST: undefined };
    const a = await login('sub-p1', 'P1', false);
    const b = await login('sub-p2', 'P2', false);
    expect((await meOf(a)).canPurchase).toBe(true);
    expect((await co(a)).status).toBe(200);
    expect((await meOf(b)).canPurchase).toBe(true);
    expect((await call('/api/billing/checkout', { method: 'POST' })).status).toBe(401); // still needs a signed-in account
    expect((await call('/api/billing/checkout', { method: 'POST', cookie: a, origin: 'https://evil.example' })).status).toBe(403);
  });

  it('a wrong value is closed: nobody can buy, with or without a malformed list', async () => {
    const cookie = await login('sub-p3', 'P3', false);
    for (const v of ['true', '1', 'OPEN', 'yes']) {
      env = { ...env, PUBLIC_SALES: v, PURCHASE_ALLOWLIST: undefined };
      expect((await co(cookie)).status, v).toBe(403);
      expect((await meOf(cookie)).canPurchase, v).toBe(false);
    }
    expect(fake.createdSessions).toBe(0);
  });

  it('open still needs every other switch: PURCHASES_ENABLED, a valid key and price, and ALLOW_LIVE_PAYMENTS for a live key', async () => {
    env = { ...env, PUBLIC_SALES: 'open', PURCHASE_ALLOWLIST: undefined };
    const cookie = await login('sub-p4', 'P4', false);
    env = { ...env, PURCHASES_ENABLED: 'false' };
    expect((await co(cookie)).status).toBe(503);
    expect((await meOf(cookie)).canPurchase).toBe(false);
    env = { ...env, PURCHASES_ENABLED: undefined };
    expect((await co(cookie)).status).toBe(503); // missing = off
    env = { ...env, PURCHASES_ENABLED: 'true', STRIPE_SECRET_KEY: 'rk_live_abcdefghijkl' };
    expect(await (await co(cookie)).json()).toEqual({ error: 'live_key_not_allowed' });
    env = { ...env, STRIPE_SECRET_KEY: 'sk_test_x1234567890', STRIPE_PRICE_ID: 'prod_notaprice' };
    expect(await (await co(cookie)).json()).toEqual({ error: 'invalid_price_id' });
    expect(fake.createdSessions).toBe(0);
  });

  it('closing it again (PUBLIC_SALES removed) returns to the allowlist at once', async () => {
    env = { ...env, PUBLIC_SALES: 'open', PURCHASE_ALLOWLIST: undefined };
    const cookie = await login('sub-p5', 'P5', false);
    expect((await co(cookie)).status).toBe(200);
    env = { ...env, PUBLIC_SALES: undefined };
    expect((await co(cookie)).status).toBe(403);
  });
});

describe('logs never carry secrets (Stripe response bodies, key fragments, credentials)', () => {
  // built at run time: a key-shaped literal in the source would be flagged by secret scanners even though it is a made-up value
  const KEYTAIL = ['rk', 'live', '51SECRETKEYFRAGMENTxyz9876'].join('_');
  const BODY = `{"error":{"message":"Invalid API Key provided: ${KEYTAIL}","type":"invalid_request_error","code":"api_key_expired"}}`;
  let logged: string;
  let spy: ReturnType<typeof vi.spyOn>;
  const ids1 = () => (raw.prepare('SELECT id FROM users LIMIT 1').get() as { id: string }).id;
  beforeEach(() => {
    logged = '';
    spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logged += a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, Object.getOwnPropertyNames(x as object)) ?? String(x))).join(' ') + '\n'; });
  });
  afterEach(() => spy.mockRestore());
  const WHSEC = ['whsec', 'abcdef1234'].join('_');
  const GOCSPX = ['GOCSPX', 'abc_def'].join('-');
  const GHP = ['ghp', 'a'.repeat(30)].join('_');
  const noSecrets = (text: string) => {
    expect(text).not.toContain(KEYTAIL);
    expect(text).not.toMatch(/rk_live_|sk_live_|whsec_|Invalid API Key/);
  };

  it('StripeError keeps only the status, its class and Stripe\u2019s short codes: no body, nothing to print', () => {
    const e = new StripeError(401, BODY);
    expect(e.status).toBe(401);
    expect(e.kind).toBe('authentication');
    expect(e.type).toBe('invalid_request_error');
    expect(e.code).toBe('api_key_expired');
    const dump = JSON.stringify(e, Object.getOwnPropertyNames(e)) + String(e) + e.message + Object.keys(e).join(',');
    noSecrets(dump);
    expect('body' in e).toBe(false);
    expect(describeError(e)).toBe('StripeError status=401 class=authentication type=invalid_request_error code=api_key_expired');
    // a malformed or hostile body: nothing is taken from it that is not a short lowercase word
    const weird = new StripeError(500, '{"error":{"type":"<script>alert(1)</script>","code":"Has Spaces And Secrets"}}');
    expect(weird.type).toBeUndefined();
    expect(weird.code).toBeUndefined();
    expect(weird.kind).toBe('stripe_unavailable');
    expect(new StripeError(502, 'not json').kind).toBe('stripe_unavailable');
    expect(new StripeError(429).kind).toBe('rate_limit');
    expect(new StripeError(404).kind).toBe('not_found');
  });

  it('describeError and redact: other errors are cut to a short redacted message, never the object or a stack', () => {
    const text = describeError(new Error(`boom ${KEYTAIL} Bearer abc.def-ghi ${WHSEC} ${GOCSPX} ${GHP}`));
    noSecrets(text);
    expect(text).not.toMatch(/Bearer abc|GOCSPX-abc|ghp_a/);
    expect(text).not.toContain(WHSEC);
    expect(text).toContain('[redacted]');
    expect(describeError(new Error('x'.repeat(5000))).length).toBeLessThan(260);
    expect(describeError('a string')).toBe('non-error value thrown (string)');
    expect(describeError({ secret: KEYTAIL })).not.toContain(KEYTAIL);
    expect(redact(`keep this, hide ${['sk', 'test', 'abcdefghijk'].join('_')}`)).toBe('keep this, hide [redacted]');
  });

  it('Stripe fails during a webhook (401 with a body that quotes the key): 500 for Stripe to retry, and the log has only status and class', async () => {
    const cookie = await login();
    await call('/api/billing/checkout', { method: 'POST', cookie });
    fake.sub = sub({ metadata: { user_id: ids1() } });
    fetchFn = async (input) => (input.includes('/v1/subscriptions/') ? new Response(BODY, { status: 401 }) : makeFetch(fake)(input));
    const res = await webhook(subEvent('evt_log_1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'processing_failed' });
    noSecrets(logged);
    expect(logged).toContain('webhook failed (customer.subscription.updated): StripeError status=401 class=authentication');
  });

  it('Stripe fails while re-reading a stale contract: the log has only status and class', async () => {
    const cookie = await login();
    const id = ids1();
    fileCustomer(id, 'cus_1');
    raw.prepare("INSERT INTO stripe_subscriptions (user_id, livemode, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at) VALUES (?, 0, 'sub_1', 'active', ?, 0, ?)").run(id, NOW() - 100, NOW() - 5000);
    fetchFn = async () => new Response(BODY, { status: 401 });
    const r = await (await call('/api/billing/status?refresh=1', { cookie })).json() as { signedIn: boolean };
    expect(r.signedIn).toBe(true); // the page still works with the stored state
    noSecrets(logged);
    expect(logged).toContain('stripe refresh failed: StripeError status=401 class=authentication');
  });

  it('an unexpected error anywhere in the API: the client gets only server_error and the log a short redacted line', async () => {
    const cookie = await login();
    const broken = { ...env, DB: { ...env.DB!, prepare: () => { throw new Error(`database exploded near ${KEYTAIL}`); } } as unknown as D1Database };
    const res = await worker.fetch(new Request(`${SITE}/api/me`, { headers: { cookie } }), broken);
    expect(res.status).toBe(500);
    const clientSide = await res.text();
    expect(JSON.parse(clientSide)).toEqual({ error: 'server_error' });
    noSecrets(clientSide);
    noSecrets(logged);
    expect(logged).toContain('api error: Error: database exploded near [redacted]');
    expect(logged).not.toMatch(/at .*\.ts|stack/i); // no stack trace
  });
});

describe('Stripe TEST and LIVE objects are kept apart (a customer id of one mode is never used with the other mode\u2019s key)', () => {
  const liveEnv = (over: Partial<Env> = {}): Env => ({ ...env, STRIPE_SECRET_KEY: 'rk_live_abcdefghijkl', ALLOW_LIVE_PAYMENTS: 'true', STRIPE_PRICE_ID: 'price_LiveGood0001', ...over });
  const goLive = () => { env = liveEnv(); fake.price = { ...goodPrice, livemode: true }; priceCheckedReset(); };
  const uidOf = () => (raw.prepare('SELECT id FROM users').get() as { id: string }).id;
  const rows = (table: string) => raw.prepare(`SELECT * FROM ${table} ORDER BY livemode`).all() as Record<string, unknown>[];
  const co = (cookie: string) => call('/api/billing/checkout', { method: 'POST', cookie });
  const stripeCalls = (re: RegExp) => fake.calls.filter((c) => re.test(c));
  const clearBurst = () => raw.prepare("DELETE FROM rate_limits WHERE key LIKE 'billing-burst:%'").run();

  it('the production case: a TEST customer id saved earlier, the LIVE key now: Checkout works, the test id is kept and filed as test, nothing is sent to Stripe with it', async () => {
    const cookie = await login();
    raw.prepare("UPDATE users SET stripe_customer_id = 'cus_TESTONLY' WHERE id = ?").run(uidOf()); // saved by the old single-column version
    goLive();
    fake.missingCustomers.add('cus_TESTONLY'); // for the live key it "does not exist"
    fake.nextCustomer = 'cus_LIVE1';
    const res = await co(cookie);
    expect(res.status).toBe(200);
    expect((await res.json() as { url: string }).url).toContain('checkout.stripe.test');
    expect(rows('stripe_customers').map((r) => [r.livemode, r.customer_id])).toEqual([[0, 'cus_TESTONLY'], [1, 'cus_LIVE1']]); // each mode has its own
    expect(raw.prepare('SELECT stripe_customer_id AS c FROM users').get()).toEqual({ c: 'cus_TESTONLY' }); // the old column is untouched
    expect(stripeCalls(/subscriptions\?customer=cus_TESTONLY/)).toEqual([]); // never asked with the wrong key (this was the server_error)
    expect(stripeCalls(/customers\?customer=cus_TESTONLY|checkout.*cus_TESTONLY/)).toEqual([]);
    expect(stripeCalls(/subscriptions\?customer=cus_LIVE1/)).toHaveLength(1);
    expect(await (await call('/api/me', { cookie })).json()).toMatchObject({ signedIn: true, premium: false });
  });

  it('an old customer id that DOES exist in this mode is adopted (no second customer is created)', async () => {
    const cookie = await login();
    raw.prepare("UPDATE users SET stripe_customer_id = 'cus_REALLIVE' WHERE id = ?").run(uidOf());
    goLive();
    expect((await co(cookie)).status).toBe(200);
    expect(rows('stripe_customers').map((r) => [r.livemode, r.customer_id])).toEqual([[1, 'cus_REALLIVE']]);
    expect(stripeCalls(/POST https:\/\/api.stripe.com\/v1\/customers$/)).toEqual([]); // nothing created
  });

  it('the same account has an independent customer in each mode, and each key always gets its own', async () => {
    const cookie = await login();
    fake.nextCustomer = 'cus_TEST_A';
    await co(cookie); // test key
    goLive();
    fake.nextCustomer = 'cus_LIVE_B';
    await co(cookie);
    expect(rows('stripe_customers').map((r) => [r.livemode, r.customer_id])).toEqual([[0, 'cus_TEST_A'], [1, 'cus_LIVE_B']]);
    fake.calls.length = 0;
    env = { ...env, STRIPE_SECRET_KEY: 'sk_test_x1234567890', ALLOW_LIVE_PAYMENTS: undefined, STRIPE_PRICE_ID: 'price_1Abc23DEF' };
    fake.price = { ...goodPrice };
    priceCheckedReset();
    clearBurst(); await co(cookie);
    expect(stripeCalls(/subscriptions\?customer=cus_TEST_A/)).toHaveLength(1); // back on the test key: the test customer
    expect(stripeCalls(/cus_LIVE_B/)).toEqual([]);
    expect(stripeCalls(/POST https:\/\/api.stripe.com\/v1\/customers$/)).toEqual([]);
  });

  it('a customer filed for this mode that Stripe does not know is NOT silently replaced: Checkout says so and creates nothing', async () => {
    const cookie = await login();
    goLive();
    raw.prepare('INSERT INTO stripe_customers (user_id, livemode, customer_id, created_at) VALUES (?, 1, ?, ?)').run(uidOf(), 'cus_GONE', NOW());
    fake.missingCustomers.add('cus_GONE');
    const res = await co(cookie);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'customer_unavailable' });
    expect(stripeCalls(/POST https:\/\/api.stripe.com\/v1\/(customers|checkout)/)).toEqual([]);
    expect(rows('stripe_customers').map((r) => r.customer_id)).toEqual(['cus_GONE']); // still there for a person to look at
    expect(fake.createdSessions).toBe(0);
  });

  it('the portal uses the customer of this mode: with only a test customer it says "no customer" and sends nothing', async () => {
    const cookie = await login();
    raw.prepare("UPDATE users SET stripe_customer_id = 'cus_TESTONLY' WHERE id = ?").run(uidOf());
    goLive();
    fake.missingCustomers.add('cus_TESTONLY');
    const res = await call('/api/billing/portal', { method: 'POST', cookie });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_customer' });
    expect(stripeCalls(/billing_portal/)).toEqual([]);
    expect(rows('stripe_customers').map((r) => [r.livemode, r.customer_id])).toEqual([[0, 'cus_TESTONLY']]); // filed as test, kept
  });

  it('webhook events of the other mode are acknowledged and never applied', async () => {
    const cookie = await login();
    goLive();
    fileCustomer(uidOf(), 'cus_LIVE9', 1);
    fake.sub = sub({ id: 'sub_1', customer: 'cus_LIVE9', livemode: true, metadata: { user_id: uidOf() } });
    const testEvent = { id: 'evt_test_mode', livemode: false, type: 'customer.subscription.created', data: { object: { id: 'sub_1', customer: 'cus_LIVE9' } } };
    const r = await webhook(testEvent);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ received: true, ignored: 'other_mode' });
    expect(rows('stripe_subscriptions')).toEqual([]);
    expect((await me(cookie)).premium).toBe(false);
    const liveEvent = { ...testEvent, id: 'evt_live_mode', livemode: true };
    expect((await webhook(liveEvent)).status).toBe(200);
    expect(rows('stripe_subscriptions').map((x) => x.livemode)).toEqual([1]);
    expect((await me(cookie)).premium).toBe(true);
  });

  it('a TEST-mode subscription can never give Premium while the live key is in use, and live data never leaks into test mode', async () => {
    const cookie = await login();
    const id = uidOf();
    raw.prepare('INSERT INTO stripe_subscriptions VALUES (?, 0, ?, ?, ?, 0, ?)').run(id, 'sub_TESTSUB', 'active', NOW() + 20 * 86400, NOW());
    goLive();
    expect((await me(cookie)).premium).toBe(false); // live key: the test row does not count
    raw.prepare('INSERT INTO stripe_subscriptions VALUES (?, 1, ?, ?, ?, 0, ?)').run(id, 'sub_LIVESUB', 'active', NOW() + 20 * 86400, NOW());
    expect((await me(cookie)).premium).toBe(true);
    env = { ...env, STRIPE_SECRET_KEY: 'sk_test_x1234567890' };
    raw.prepare('DELETE FROM stripe_subscriptions WHERE livemode = 0').run();
    expect((await me(cookie)).premium).toBe(false); // test key: the live row does not count either
  });

  it('an old-table subscription is checked once: unknown to this mode -> filed as the other mode (kept, grants nothing); known -> this mode\u2019s', async () => {
    const cookie = await login();
    const id = uidOf();
    raw.prepare('INSERT INTO subscriptions VALUES (?, ?, ?, ?, 0, ?)').run(id, 'sub_1', 'active', NOW() + 20 * 86400, NOW());
    goLive();
    fake.missingSubs = new Set(['sub_1']); // a test-mode subscription: "no such subscription" for the live key
    expect((await me(cookie)).premium).toBe(false);
    expect(rows('stripe_subscriptions').map((r) => [r.livemode, r.stripe_subscription_id])).toEqual([[0, 'sub_1']]);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM subscriptions').get()).toEqual({ n: 1 }); // the old row is untouched
    const asked = stripeCalls(/subscriptions\/sub_1/).length;
    await me(cookie);
    expect(stripeCalls(/subscriptions\/sub_1/).length).toBe(asked); // decided once, not on every page load
  });

  it('a genuine LIVE subscription saved by the old version keeps its Premium: it is checked once, found in the live world and filed as live', async () => {
    const cookie = await login();
    const id = uidOf();
    raw.prepare('INSERT INTO subscriptions VALUES (?, ?, ?, ?, 0, ?)').run(id, 'sub_1', 'active', NOW() + 20 * 86400, NOW());
    goLive();
    fileCustomer(id, 'cus_1', 1);
    fake.sub = sub({ id: 'sub_1', customer: 'cus_1', livemode: true, metadata: { user_id: id } });
    expect((await me(cookie)).premium).toBe(true);
    expect(rows('stripe_subscriptions').map((r) => [r.livemode, r.stripe_subscription_id])).toEqual([[1, 'sub_1']]);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM subscriptions').get()).toEqual({ n: 1 }); // the old row stays
  });

  it('works with no migration applied: the Worker creates the two (empty) tables itself, existing data untouched', async () => {
    const m = makeDb(false);
    raw = m.raw;
    env = { ...env, DB: m.d1 };
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'stripe_customers'").get()).toBeUndefined();
    const cookie = await login();
    expect((await co(cookie)).status).toBe(200);
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name IN ('stripe_customers', 'stripe_subscriptions') ORDER BY name").all()).toHaveLength(2);
    expect(rows('stripe_customers')).toHaveLength(1);
  });
});
