#!/usr/bin/env node
/**
 * Full purchase flow against the Stripe SANDBOX (no real money, nothing in production is touched):
 *
 *   PATH=$HOME/.local/bin:$PATH node scripts/sandbox-integration.mjs
 *
 * What runs for real:
 *  - the Worker exactly as it is deployed (bundled by `wrangler deploy --dry-run`) inside workerd (Miniflare),
 *    with a real local D1 (SQLite) that has the real migration applied;
 *  - Stripe's own hosted Checkout page, paid with the Stripe test card in a headless browser;
 *  - real Sandbox webhook events, forwarded by `stripe listen` and checked with the CLI's signing secret.
 * What is stand-in: Google sign-in (the token endpoint answers with a made-up ID token) and the Worker's outgoing calls to
 * api.stripe.com, which are answered by the same Sandbox through the Stripe CLI (so no API key is needed or printed).
 * Everything created in the Sandbox is removed or deactivated at the end. It refuses to run unless the CLI is in a sandbox.
 */
import { execFile, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8789;
const SITE = `http://localhost:${PORT}`;
const GID = 'e2e-google-client';
const RUN = Math.random().toString(36).slice(2, 8); // Stripe remembers idempotency keys (customer-<user id>) for a day: a new id per run
const USER = `e2e-user-${RUN}-aaaa`;
const OTHER = `e2e-user-${RUN}-bbbb`;

const stripe = async (...args) => (await run('stripe', args, { maxBuffer: 16e6 })).stdout;
const stripeJson = async (...args) => {
  const out = await stripe(...args);
  return JSON.parse(out.slice(out.indexOf('{')));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok, what, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};

async function loadMiniflare() {
  // Miniflare 4 is not a dependency of this repo. Install it once, outside the repo:
  //   mkdir /tmp/mf4 && cd /tmp/mf4 && npm init -y && npm i miniflare@4      (or point MINIFLARE_DIR at any miniflare@4 folder)
  const dir = process.env.MINIFLARE_DIR || '/tmp/mf4/node_modules/miniflare';
  if (existsSync(dir)) return createRequire(join(dir, 'x.js'))('miniflare');
  try { return await import('miniflare'); } catch { /* not installed here either */ }
  throw new Error('Miniflare 4 not found: mkdir /tmp/mf4 && cd /tmp/mf4 && npm init -y && npm i miniflare@4');
}

// ---- the Worker's outgoing Stripe calls, answered by the Sandbox through the CLI ----
async function stripeProxy(request) {
  const u = new URL(request.url);
  const method = request.method;
  const body = method === 'GET' || method === 'DELETE' ? '' : await request.text();
  // (the CLI ignores a query string inside the path: parameters of every method go in as -d key=value)
  const args = method === 'GET' ? ['get', u.pathname] : method === 'DELETE' ? ['delete', u.pathname, '--confirm'] : ['post', u.pathname];
  for (const [k, v] of method === 'GET' ? u.searchParams : new URLSearchParams(body)) args.push('-d', `${k}=${v}`);
  const idem = request.headers.get('idempotency-key');
  if (idem && method === 'POST') args.push('--idempotency', idem);
  try {
    const out = await stripe(...args);
    return new Response(out.slice(out.indexOf('{')), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    const out = String(e.stdout ?? '');
    const text = out.includes('{') ? out.slice(out.indexOf('{')) : '{"error":{"message":"cli failure"}}';
    return new Response(text, { status: /resource_missing|No such/.test(text) ? 404 : 400, headers: { 'content-type': 'application/json' } });
  }
}

const jwt = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64').replace(/=+$/, '')}.y`;
let googleClaims = {};

async function main() {
  const probe = await run('stripe', ['get', '/v1/customers', '--limit', '1']).then((r) => r.stdout + r.stderr);
  if (!/sandbox|test mode/i.test(probe) || /live mode/i.test(probe)) throw new Error('the Stripe CLI is not in a sandbox / test mode: refusing to run');
  const whsec = (await stripe('listen', '--print-secret')).trim();
  if (!/^whsec_/.test(whsec)) throw new Error('could not read the CLI signing secret');

  const tmp = mkdtempSync(join(tmpdir(), 'slides-e2e-'));
  console.log('Bundling the Worker (wrangler deploy --dry-run) …');
  await run('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', tmp], { cwd: ROOT, maxBuffer: 16e6 });
  const { Miniflare } = await loadMiniflare();

  // Sandbox objects for this run: a ¥200 monthly price, like production's
  const price = await stripeJson('prices', 'create', '--unit-amount=200', '--currency=jpy', '-d', 'recurring[interval]=month', '-d', 'product_data[name]=ART SLIDE Premium (integration test)');
  const created = { price: price.id, product: price.product, customers: new Set(), portalConfig: '' };

  const mf = new Miniflare({
    modules: true,
    scriptPath: join(tmp, 'index.js'),
    modulesRoot: tmp,
    compatibilityDate: '2025-09-01',
    d1Databases: { DB: 'e2e-db' },
    bindings: {
      SITE_URL: SITE,
      GOOGLE_CLIENT_ID: GID,
      GOOGLE_CLIENT_SECRET: 'e2e-google-secret',
      SESSION_SECRET: 'e2e-session-secret-0123456789',
      STRIPE_SECRET_KEY: 'sk_test_sandboxViaCliProxy',
      STRIPE_WEBHOOK_SECRET: whsec,
      STRIPE_PRICE_ID: price.id,
      PURCHASES_ENABLED: 'true',
      PURCHASE_ALLOWLIST: USER, // as deployed: only listed accounts may buy
    },
    serviceBindings: { ASSETS: async () => new Response('asset') },
    outboundService: async (request) => {
      const host = new URL(request.url).hostname;
      if (host === 'api.stripe.com') return stripeProxy(request);
      if (host === 'oauth2.googleapis.com') return Response.json({ id_token: jwt(googleClaims) });
      return new Response('{}', { status: 404 });
    },
  });
  await mf.ready;

  // the real migration on the real (local) D1
  const db = await mf.getD1Database('DB');
  const sql = readFileSync(join(ROOT, 'migrations/0001_init.sql'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  await db.batch(sql.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
  const now = Math.floor(Date.now() / 1000);
  for (const [id, sub, name] of [[USER, 'g-e2e-1', 'E2E Tester'], [OTHER, 'g-e2e-2', 'E2E Other']]) {
    await db.prepare('INSERT INTO users (id, google_sub, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, sub, name, now, now).run();
  }

  // every webhook delivery that reaches the Worker is recorded (the Worker answers it; Stripe CLI forwards the real events here)
  const deliveries = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');
    const r = await mf.dispatchFetch(`${SITE}${req.url}`, { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'connection', 'content-length'].includes(k))), body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body, redirect: 'manual' });
    const answer = await r.text();
    if (req.url === '/api/stripe/webhook') {
      let type = '', id = '';
      try { const j = JSON.parse(body); type = j.type; id = j.id; } catch { /* not json */ }
      deliveries.push({ type, id, body, sig: String(req.headers['stripe-signature'] ?? ''), status: r.status, answer });
    }
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'text/plain' }).end(answer);
  });
  await new Promise((ok) => server.listen(PORT, 'localhost', ok));

  const events = 'checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,invoice.paid,invoice.payment_failed,invoice.payment_succeeded';
  const listener = spawn('stripe', ['listen', '--events', events, '--forward-to', `${SITE}/api/stripe/webhook`], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('stripe listen did not become ready')), 30000);
    const on = (d) => { if (/Ready!/.test(d.toString())) { clearTimeout(t); ok(); } };
    listener.stdout.on('data', on); listener.stderr.on('data', on);
  });

  // ---- helpers on the Worker ----
  const jar = {};
  const call = async (path, { method = 'GET', cookieOf, origin = SITE, body } = {}) => {
    const headers = {};
    if (cookieOf) headers.cookie = cookieOf;
    if (method === 'POST') headers.origin = origin;
    return mf.dispatchFetch(`${SITE}${path}`, { method, headers, body, redirect: 'manual' });
  };
  const cookies = (res, into = {}) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); into[kv.slice(0, i)] = kv.slice(i + 1); } return into; };
  const header = (c) => Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
  async function login(googleSub, name) {
    const start = await call('/api/auth/google?return=/art-slide/premium');
    const loc = new URL(start.headers.get('location'));
    const c = cookies(start);
    googleClaims = { iss: 'https://accounts.google.com', aud: GID, sub: googleSub, name, exp: now + 3600, nonce: loc.searchParams.get('nonce') };
    const done = await call(`/api/auth/callback?code=abc&state=${loc.searchParams.get('state')}`, { cookieOf: header(c) });
    Object.assign(c, cookies(done));
    jar[googleSub] = header(c);
    return done.status === 302 ? jar[googleSub] : '';
  }
  const meOf = async (cookie) => (await call('/api/me', { cookieOf: cookie })).json();
  const waitFor = async (pred, label, ms = 90000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = await pred(); if (v) return v; await sleep(500); }
    throw new Error(`timed out waiting for ${label}`);
  };
  const row = async () => db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(USER).first();

  let browser;
  try {
    console.log('\n1. The Worker (as deployed) boots on workerd with a local D1');
    const cfg = await (await call('/api/config')).json();
    check(cfg.auth === true && cfg.billing === true && cfg.purchases === true, '/api/config: auth, billing and purchases are on', JSON.stringify({ auth: cfg.auth, billing: cfg.billing, purchases: cfg.purchases }));
    const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map((r) => r.name);
    check(['users', 'subscriptions', 'stripe_events', 'sessions'].every((t) => tables.includes(t)), 'the real migration created the tables');

    console.log('\n2. Sign in (Google is stubbed) and the purchase allowlist');
    const cookie = await login('g-e2e-1', 'E2E Tester');
    const other = await login('g-e2e-2', 'E2E Other');
    check(!!cookie && !!other, 'both accounts signed in (session cookie issued)');
    const me0 = await meOf(cookie);
    check(me0.signedIn && me0.premium === false && me0.canPurchase === true, 'listed account: Free, may buy', JSON.stringify({ premium: me0.premium, canPurchase: me0.canPurchase }));
    check((await meOf(other)).canPurchase === false, 'unlisted account: may not buy');
    const denied = await call('/api/billing/checkout', { method: 'POST', cookieOf: other });
    check(denied.status === 403, 'unlisted account: Checkout refused with 403', `HTTP ${denied.status}`);
    check((await call('/api/billing/checkout', { method: 'POST' })).status === 401, 'not signed in: 401');
    check((await call('/api/billing/checkout', { method: 'POST', cookieOf: cookie, origin: 'https://evil.example' })).status === 403, 'request from another site: 403');

    console.log('\n3. Checkout is created through the Worker (real Sandbox) and paid on Stripe’s hosted page');
    const co = await call('/api/billing/checkout', { method: 'POST', cookieOf: cookie });
    const coBody = await co.json();
    check(co.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(coBody.url ?? ''), 'Worker returned a Stripe Checkout URL', `HTTP ${co.status}${coBody.error ? ' ' + coBody.error : ''}`);
    const u1 = await db.prepare('SELECT stripe_customer_id AS c FROM users WHERE id = ?').bind(USER).first();
    const cust = u1?.c ?? '';
    if (cust) created.customers.add(cust);
    check(/^cus_/.test(cust), 'a Sandbox customer was created and tied to the account');
    check(!(await db.prepare('SELECT stripe_customer_id AS c FROM users WHERE id = ?').bind(OTHER).first()).c, 'the refused account got no Stripe customer');

    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 1000 } })).newPage();
    await page.goto(coBody.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#payment-numberInput, iframe').first().waitFor({ timeout: 45000 }).catch(() => undefined);
    const frame = await waitFor(async () => { for (const f of page.frames()) if (f.url().includes('elements-inner') && (await f.locator('#payment-numberInput').count().catch(() => 0))) return f; return null; }, 'the card form', 60000);
    await frame.locator('#linkAuthentication-emailInput').fill('e2e-tester@example.com').catch(() => undefined);
    await frame.locator('#payment-numberInput').fill('4242424242424242');
    await frame.locator('#payment-expiryInput').fill('1234');
    await frame.locator('#payment-cvcInput').fill('123');
    await frame.locator('#payment-nameInput').fill('E2E Tester');
    await page.screenshot({ path: '/tmp/proto/before-pay.png' }).catch(() => undefined);
    const clickSubscribe = async () => {
      for (const f of page.frames()) {
        const el = f.locator('button, [role=button], div, span').filter({ hasText: /^\s*Subscribe\s*$/ }).last();
        if (await el.count().catch(() => 0)) { await el.click({ timeout: 10000 }); return true; }
      }
      return false;
    };
    await waitFor(clickSubscribe, 'the Subscribe button', 30000);
    await page.waitForURL(/checkout=success/, { timeout: 120000 });
    check(true, 'Stripe accepted the test card and sent the browser back to the success URL', new URL(page.url()).pathname + new URL(page.url()).search);

    console.log('\n4. The real webhook events reach the Worker and the account becomes Premium');
    await waitFor(() => deliveries.find((d) => d.type === 'checkout.session.completed'), 'checkout.session.completed');
    await waitFor(async () => (await meOf(cookie)).premium === true, 'Premium after the webhook', 90000);
    const types = [...new Set(deliveries.map((d) => d.type))];
    check(types.includes('checkout.session.completed') && types.includes('customer.subscription.created'), 'events delivered', types.join(', '));
    check(deliveries.every((d) => d.status === 200), 'every real event was answered 200', deliveries.map((d) => `${d.type}:${d.status}`).join(' '));
    const r1 = await row();
    const subId = r1.stripe_subscription_id;
    const live = await stripeJson('get', `/v1/subscriptions/${subId}`);
    const liveEnd = live.current_period_end ?? live.items.data[0].current_period_end;
    const me1 = await meOf(cookie);
    check(r1.status === 'active', 'D1: subscription stored with status active', r1.status);
    check(r1.current_period_end === liveEnd, 'D1: period end equals Stripe’s current_period_end', new Date(liveEnd * 1000).toISOString().slice(0, 10));
    check(me1.premium === true && me1.status === 'active' && me1.cancelAtPeriodEnd === false && me1.currentPeriodEnd === liveEnd, '/api/me: Premium, renewing, same period end');
    check((await meOf(other)).premium === false, 'the other account is still Free');
    const ev = deliveries.find((d) => d.type === 'customer.subscription.created') ?? deliveries[0];
    const replay = await (await mf.dispatchFetch(`${SITE}/api/stripe/webhook`, { method: 'POST', body: ev.body, headers: { 'stripe-signature': ev.sig } })).json();
    check(replay.duplicate === true, 'the same event delivered again is recognised as a duplicate');
    const bad = await mf.dispatchFetch(`${SITE}/api/stripe/webhook`, { method: 'POST', body: ev.body, headers: { 'stripe-signature': 't=1,v1=00' } });
    check(bad.status === 400, 'a wrong signature is refused with 400');
    const second = await call('/api/billing/checkout', { method: 'POST', cookieOf: cookie });
    check(second.status === 409, 'a second Checkout for the same account is refused (one contract per account)', `HTTP ${second.status}`);

    console.log('\n5. Customer portal');
    let portal = await call('/api/billing/portal', { method: 'POST', cookieOf: cookie });
    if (portal.status !== 200) {
      // the Sandbox may have no portal configuration yet: create a minimal one (cancel at period end), as the dashboard would
      const cfgRes = await stripeJson('billing_portal', 'configurations', 'create', '-d', 'business_profile[headline]=ART SLIDE (integration test)', '-d', 'features[subscription_cancel][enabled]=true', '-d', 'features[subscription_cancel][mode]=at_period_end', '-d', 'features[invoice_history][enabled]=true').catch(() => null);
      if (cfgRes?.id) created.portalConfig = cfgRes.id;
      portal = await call('/api/billing/portal', { method: 'POST', cookieOf: cookie });
    }
    const portalBody = await portal.json();
    check(portal.status === 200 && /^https:\/\/billing\.stripe\.com\//.test(portalBody.url ?? ''), 'Worker returned a Stripe customer-portal URL', `HTTP ${portal.status}${portalBody.error ? ' ' + portalBody.error : ''}`);
    check((await call('/api/billing/portal', { method: 'POST' })).status === 401, 'portal: not signed in → 401');

    console.log('\n6. Cancel at the end of the period (what the portal’s “cancel” does)');
    const before = deliveries.length;
    await stripe('subscriptions', 'update', subId, '-d', 'cancel_at_period_end=true');
    await waitFor(() => deliveries.slice(before).find((d) => d.type === 'customer.subscription.updated' && d.status === 200 && JSON.parse(d.body).data.object.cancel_at_period_end === true), 'the cancel update');
    const r2 = await row();
    const me2 = await meOf(cookie);
    check(r2.cancel_at_period_end === 1 && r2.status === 'active', 'D1: marked as ending, still active');
    check(me2.premium === true && me2.cancelAtPeriodEnd === true, '/api/me: still Premium, shown as ending');
    check(me2.currentPeriodEnd === liveEnd && r2.current_period_end === liveEnd, 'access ends exactly at Stripe’s period end', new Date(liveEnd * 1000).toISOString());
    // the access rule at the boundary, with the real stored row
    const { hasPremium } = await import(pathToFileURL(join(ROOT, 'worker/entitlement.ts')).href).catch(() => ({}));
    if (hasPremium) {
      check(hasPremium(r2, liveEnd - 1) === true && hasPremium(r2, liveEnd) === false, 'one second before the end: Premium; at the end: Free (no grace for a cancelled contract)');
    }

    console.log('\n7. Cancel immediately (e.g. by the operator in the dashboard)');
    const before2 = deliveries.length;
    await stripe('subscriptions', 'cancel', subId, '--confirm');
    await waitFor(() => deliveries.slice(before2).find((d) => d.type === 'customer.subscription.deleted' && d.status === 200), 'customer.subscription.deleted');
    const me3 = await meOf(cookie);
    const r3 = await row();
    check(r3.status === 'canceled', 'D1: status canceled', r3.status);
    check(me3.premium === false, '/api/me: back to Free at once');
    check((await meOf(other)).premium === false, 'the other account was never affected');

    console.log('\n8. Nothing can bill again');
    const subs = await stripeJson('get', '/v1/subscriptions', '-d', `customer=${cust}`, '-d', 'status=all');
    check(subs.data.length === 1 && subs.data.every((s) => s.status === 'canceled'), 'Stripe: the customer’s only subscription is canceled', subs.data.map((s) => s.status).join(','));
    const evs = (await db.prepare('SELECT COUNT(*) AS n FROM stripe_events').first()).n;
    check(evs >= 4, 'processed event ids are recorded in D1', `${evs} rows`);
    check(deliveries.every((d) => d.status === 200), 'no webhook failed during the whole flow');
  } finally {
    await browser?.close().catch(() => undefined);
    listener.kill();
    server.close();
    for (const c of created.customers) await stripe('customers', 'delete', c, '--confirm').then(() => console.log(`\n(cleanup) Sandbox customer ${c} deleted`)).catch(() => console.log(`\n(cleanup) could not delete ${c}`));
    await stripe('prices', 'update', created.price, '-d', 'active=false').then(() => console.log('(cleanup) Sandbox price deactivated')).catch(() => undefined);
    await stripe('products', 'update', created.product, '-d', 'active=false').then(() => console.log('(cleanup) Sandbox product archived')).catch(() => undefined);
    if (created.portalConfig) console.log(`(note) a Sandbox portal configuration was created (${created.portalConfig}); it only exists in the Sandbox`);
    await mf.dispose().catch(() => undefined);
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll sandbox integration checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error('\nERROR:', e instanceof Error ? e.message.replace(/(sk|rk|whsec)_[A-Za-z0-9_]+/g, '$1_<hidden>') : e); process.exit(2); });
