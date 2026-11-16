import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { claimsValid, decodeClaims } from './auth';
import { hmacHex } from './crypto';
import type { D1Database, D1PreparedStatement, Env } from './env';
import { hasPremium, RENEWAL_GRACE_SECONDS } from './entitlement';
import { safeReturnPath } from './http';
import { handle } from './index';
import { formEncode, verifyStripeSignature, type FetchFn } from './stripe';

// ---- an in-memory D1 (SQLite) running the real migration ----
function makeDb(): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
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
interface Fake { sub: Record<string, unknown>; calls: string[]; googleClaims: Record<string, unknown>; failStripe: boolean }
function makeFetch(f: Fake): FetchFn {
  return async (input, init) => {
    const method = init?.method ?? 'GET';
    f.calls.push(`${method} ${input}`);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (input.startsWith('https://oauth2.googleapis.com/token')) return ok({ id_token: jwt(f.googleClaims) });
    if (f.failStripe) return new Response('{"error":"boom"}', { status: 500 });
    if (input.endsWith('/v1/customers') && method === 'POST') return ok({ id: 'cus_1' });
    if (input.endsWith('/v1/checkout/sessions')) return ok({ id: 'cs_1', url: 'https://checkout.stripe.test/c/1' });
    if (input.endsWith('/v1/billing_portal/sessions')) return ok({ url: 'https://billing.stripe.test/p/1' });
    if (input.includes('/v1/subscriptions?customer=')) return ok({ data: f.sub.id ? [f.sub] : [] });
    if (input.includes('/v1/subscriptions/sub_1')) {
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
const baseEnv = (d1: D1Database): Env => ({
  ASSETS: { fetch: async () => new Response('asset') },
  DB: d1,
  SITE_URL: SITE,
  GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'gsecret',
  SESSION_SECRET: 'session-secret',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRICE_ID: 'price_1',
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
async function login(sub_ = 'google-sub-1', name = 'Ann Example'): Promise<string> {
  const start = await call('/api/auth/google?return=/art-slide/premium');
  const loc = new URL(start.headers.get('location')!);
  const oauth = cookieOf(start, '__Host-slides_oauth') ?? cookieOf(start, 'slides_oauth')!;
  const nonce = loc.searchParams.get('nonce')!;
  fake.googleClaims = { iss: 'https://accounts.google.com', aud: 'gid', sub: sub_, name, exp: NOW() + 3600, nonce };
  const done = await call(`/api/auth/callback?code=abc&state=${loc.searchParams.get('state')}`, { cookie: oauth });
  expect(done.status).toBe(302);
  expect(done.headers.get('location')).toBe('/art-slide/premium');
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
  fake = { sub: {}, calls: [], googleClaims: {}, failStripe: false };
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
    expect(hasPremium(row('canceled', n + 100), n)).toBe(true); // paid period remains
    expect(hasPremium(row('canceled', n - 1), n)).toBe(false);
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
    expect(await (await call('/api/config')).json()).toEqual({ auth: true, billing: true });
    env = { ...env, STRIPE_SECRET_KEY: undefined };
    expect(await (await call('/api/config')).json()).toEqual({ auth: true, billing: false });
    env = { ASSETS: env.ASSETS };
    expect(await (await call('/api/config')).json()).toEqual({ auth: false, billing: false });
    expect((await call('/api/me')).status).toBe(503);
    expect((await call('/api/auth/google')).status).toBe(503);
    expect((await call('/api/stripe/webhook', { method: 'POST', body: '{}', origin: null })).status).toBe(503);
    expect((await call('/api/nope')).status).toBe(404);
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
    expect(await me(cookie)).toMatchObject({ signedIn: true, premium: false, name: 'Ann Example' });
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
    expect(raw.prepare('SELECT stripe_customer_id FROM users').get()).toEqual({ stripe_customer_id: 'cus_1' });
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

  it('limits how often the billing endpoints can be called', async () => {
    const cookie = await login();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await call('/api/billing/checkout', { method: 'POST', cookie })).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
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
    expect(raw.prepare('SELECT cancel_at_period_end AS c FROM subscriptions').get()).toEqual({ c: 1 });
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

  it('ignores a subscription that belongs to nobody here', async () => {
    fake.sub = sub({ metadata: {}, customer: 'cus_unknown' });
    expect((await webhook({ id: 'evt_u', type: 'customer.subscription.created', data: { object: { id: 'sub_1', customer: 'cus_unknown' } } })).status).toBe(200);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM subscriptions').get()).toEqual({ n: 0 });
  });

  it('re-reads Stripe when a stored period has run out (missed webhook): renewed -> Premium, ended -> Free', async () => {
    const { cookie, uid } = await subscribed();
    const stale = () => raw.prepare('INSERT OR REPLACE INTO subscriptions VALUES (?, ?, ?, ?, 0, ?)').run(uid, 'sub_1', 'active', NOW() - 5 * 86400, NOW() - 3600);
    stale();
    expect((await me(cookie)).premium).toBe(true); // Stripe says it was renewed: the stored row is corrected
    expect((raw.prepare('SELECT current_period_end AS e FROM subscriptions').get() as { e: number }).e).toBeGreaterThan(NOW());
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
    for (const t of ['users', 'subscriptions', 'sessions']) expect(raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual({ n: 0 });
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
