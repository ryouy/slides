/**
 * End-to-end check of the Stripe webhook against the Stripe SANDBOX, with no Cloudflare account and no real money:
 *
 *   PATH=$HOME/.local/bin:$PATH npx vite-node scripts/webhook-e2e.ts
 *
 * What runs: the real Worker code (`handle` in worker/index.ts: signature check, event handling, D1 writes) on an in-memory
 * SQLite D1, behind a local HTTP server. `stripe listen` forwards REAL Sandbox events to it, signed with the CLI's own
 * signing secret (not the production one). The Worker's calls to the Stripe API are answered by the same Sandbox through
 * `stripe get`, so no API key is needed here or printed. Objects are created in the Sandbox only and deleted at the end.
 * It refuses to run unless the CLI says it is in a sandbox.
 */
import { execFile, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import type { D1Database, D1PreparedStatement, Env } from '../worker/env';
import { hasPremium } from '../worker/entitlement';
import { handle } from '../worker/index';
import type { FetchFn } from '../worker/stripe';

const run = promisify(execFile);
const PORT = 8788;
const URL_LOCAL = `http://127.0.0.1:${PORT}/api/stripe/webhook`;
const USER = 'u_e2e_user';

const stripe = async (...args: string[]): Promise<string> => (await run('stripe', args, { maxBuffer: 8e6 })).stdout;
const stripeJson = async (...args: string[]): Promise<any> => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out = await stripe(...args);
  return JSON.parse(out.slice(out.indexOf('{')));
};

function makeDb(): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  raw.exec(readFileSync(new URL('../migrations/0002_stripe_modes.sql', import.meta.url), 'utf8'));
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

let failures = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Seen { type: string; id: string; body: string; sig: string; status: number; answer: string }
const seen: Seen[] = [];
async function waitFor(pred: (s: Seen) => boolean, label: string, ms = 45000): Promise<Seen> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = seen.find(pred);
    if (hit) return hit;
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const sign = (body: string, secret: string, ts = Math.floor(Date.now() / 1000)) => `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
const post = (body: string, sig: string | null) => fetch(URL_LOCAL, { method: 'POST', body, headers: sig ? { 'stripe-signature': sig } : {} });

async function main() {
  const who = await stripe('config', '--list').catch(() => '');
  const probe = await run('stripe', ['get', '/v1/customers', '--limit', '1']).then((r) => r.stdout + r.stderr);
  if (!/sandbox|test mode/i.test(probe) || /live mode/i.test(probe)) throw new Error('the Stripe CLI is not in a sandbox / test mode: refusing to run');
  void who;
  const secret = (await stripe('listen', '--print-secret')).trim();
  if (!/^whsec_/.test(secret)) throw new Error('could not read the CLI signing secret');

  const { d1, raw } = makeDb();
  const now = Math.floor(Date.now() / 1000);
  raw.prepare('INSERT INTO users (id, google_sub, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(USER, 'g_e2e', 'E2E', now, now);
  const env: Env = {
    ASSETS: { fetch: async () => new Response('asset') },
    DB: d1,
    SITE_URL: 'http://127.0.0.1:' + PORT,
    GOOGLE_CLIENT_ID: 'gid',
    GOOGLE_CLIENT_SECRET: 'gsecret',
    SESSION_SECRET: 'e2e-session-secret',
    STRIPE_SECRET_KEY: 'sk_test_sandboxViaCli00',
    STRIPE_WEBHOOK_SECRET: secret,
    STRIPE_PRICE_ID: 'price_1Abc23DEF',
    PURCHASES_ENABLED: 'false', // stays off: only the webhook path is exercised
  };
  // the Worker's Stripe API reads are answered by the Sandbox through the CLI
  const fetchFn: FetchFn = async (input, init) => {
    if ((init?.method ?? 'GET') !== 'GET') throw new Error('the webhook path must only READ from Stripe, got ' + init?.method);
    const path = input.replace('https://api.stripe.com', '');
    try {
      const out = await stripe('get', path);
      return new Response(out.slice(out.indexOf('{')), { status: 200 });
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return new Response(String(e.stdout ?? '{}'), { status: /resource_missing|404/.test(String(e.stdout ?? e.message)) ? 404 : 500 });
    }
  };

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    const sig = String(req.headers['stripe-signature'] ?? '');
    const r = await handle(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, body, headers: sig ? { 'stripe-signature': sig } : {} }), env, { fetchFn });
    const answer = await r.text();
    let type = '', id = '';
    try { const j = JSON.parse(body); type = j.type; id = j.id; } catch { /* not json */ }
    seen.push({ type, id, body, sig, status: r.status, answer });
    res.writeHead(r.status, { 'content-type': 'application/json' }).end(answer);
  });
  await new Promise<void>((ok) => server.listen(PORT, '127.0.0.1', ok));

  const listener = spawn('stripe', ['listen', '--events', 'checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,invoice.paid,invoice.payment_failed,invoice.payment_succeeded', '--forward-to', URL_LOCAL], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((ok, bad) => {
    const t = setTimeout(() => bad(new Error('stripe listen did not become ready')), 30000);
    const on = (d: Buffer) => { if (/Ready!/.test(d.toString())) { clearTimeout(t); ok(); } };
    listener.stdout.on('data', on); listener.stderr.on('data', on);
  });

  let cust = '';
  try {
    console.log('\n1. Signature check (the real endpoint, real secret)');
    const evt = JSON.stringify({ id: 'evt_selftest_1', type: 'ping.test', data: { object: {} } });
    check((await post(evt, null)).status === 400, 'no Stripe-Signature header → 400');
    check((await post(evt, 't=1,v1=deadbeef')).status === 400, 'wrong signature → 400');
    check((await post(evt, sign(evt, 'whsec_notTheRightSecret'))).status === 400, 'signed with another secret (e.g. a different endpoint) → 400');
    check((await post(evt, sign(evt, secret, Math.floor(Date.now() / 1000) - 3600))).status === 400, 'correct secret but a timestamp an hour old (replay) → 400');
    check((await post(evt + ' ', sign(evt, secret))).status === 400, 'body changed after signing → 400');
    const ok1 = await post(evt, sign(evt, secret));
    check(ok1.status === 200, 'valid signature, unrelated event type → 200 (ignored)');
    const dup = await post(evt, sign(evt, secret));
    check(dup.status === 200 && (await dup.json()).duplicate === true, 'the same event id again → 200 duplicate (not processed twice)');

    console.log('\n2. A subscription is created in the Sandbox (event forwarded by the Stripe CLI)');
    await stripe('trigger', 'customer.subscription.created', '--override', `subscription:metadata[user_id]=${USER}`);
    const created = await waitFor((s) => s.type === 'customer.subscription.created', 'customer.subscription.created');
    check(created.status === 200, 'real signed event accepted by the Worker', `HTTP ${created.status}`);
    const sub = JSON.parse(created.body).data.object;
    cust = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const row = () => raw.prepare('SELECT * FROM stripe_subscriptions WHERE user_id = ? AND livemode = 0').get(USER) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const nowS = () => Math.floor(Date.now() / 1000);
    check(!!row() && row().stripe_subscription_id === sub.id, 'subscription stored for the account named in the metadata');
    check((raw.prepare('SELECT customer_id AS c FROM stripe_customers WHERE user_id = ? AND livemode = 0').get(USER) as any).c === cust, 'the Stripe customer is tied to the account');
    check(['active', 'trialing'].includes(row()?.status) && hasPremium(row(), nowS()), 'status is active → Premium', row()?.status);
    const live = await stripeJson('get', `/v1/subscriptions/${sub.id}`);
    const liveEnd: number = live.current_period_end ?? live.items.data[0].current_period_end;
    check(row()?.current_period_end === liveEnd, 'stored period end equals Stripe’s current_period_end', new Date(liveEnd * 1000).toISOString());

    console.log('\n3. Cancelling at the end of the period (what the customer portal does)');
    await stripe('subscriptions', 'update', sub.id, '--cancel-at-period-end=true');
    await waitFor((s) => s.type === 'customer.subscription.updated' && s.status === 200 && JSON.parse(s.body).data.object.cancel_at_period_end === true, 'the cancel update');
    check(row().cancel_at_period_end === 1, 'marked as cancelling');
    check(hasPremium(row(), nowS()), 'still Premium now (paid time is kept)');
    check(hasPremium(row(), liveEnd - 1), 'Premium one second before the period ends');
    check(!hasPremium(row(), liveEnd), 'Free exactly when the period ends (no grace once cancelled)');
    check(row().current_period_end === liveEnd, 'period end unchanged by the cancel');

    console.log('\n4. Duplicates, re-delivery and out-of-order events');
    const again = await post(created.body, sign(created.body, secret));
    check(again.status === 200 && (await again.json()).duplicate === true, 'Stripe re-sending the same event → duplicate, no second write');
    const lateId = 'evt_late_copy_1';
    const late = JSON.stringify({ ...JSON.parse(created.body), id: lateId }); // the OLD "created" payload (active, not cancelling) arriving late, as a new delivery
    const lr = await post(late, sign(late, secret));
    check(lr.status === 200, 'a stale "created" payload delivered late is accepted');
    check(row().cancel_at_period_end === 1, 'but it does not undo the cancellation (the Worker re-reads Stripe’s current state)');
    const evs = (raw.prepare('SELECT COUNT(*) AS n FROM stripe_events').get() as any).n; // eslint-disable-line @typescript-eslint/no-explicit-any
    check(evs >= 3, 'processed event ids are recorded', `${evs} rows`);
    const tampered = JSON.stringify({ ...JSON.parse(created.body), id: 'evt_x_tamper', data: { object: { ...sub, id: 'sub_forged', metadata: { user_id: USER } } } });
    const tr = await post(tampered, sign(tampered, secret));
    check(tr.status === 500 || tr.status === 200, 'a forged payload with a valid signature never decides state by itself', `HTTP ${tr.status}`);
    check(row().stripe_subscription_id === sub.id, 'the account’s subscription was not replaced by the forged id');

    console.log('\n5. The contract ends');
    await stripe('subscriptions', 'cancel', sub.id, '--confirm');
    await waitFor((s) => s.type === 'customer.subscription.deleted' && s.status === 200, 'customer.subscription.deleted');
    check(row().status === 'canceled', 'status canceled', row().status);
    check(!hasPremium(row(), nowS()), 'back to Free immediately');

    console.log('\n6. Events with no matching account');
    await stripe('trigger', 'customer.subscription.created'); // no user_id in its metadata
    await waitFor((s) => s.type === 'customer.subscription.created' && s.id !== created.id && s.id !== lateId && s.status === 200, 'an unrelated subscription event');
    check((raw.prepare('SELECT COUNT(*) AS n FROM stripe_subscriptions').get() as any).n === 1, 'a subscription that belongs to no account of ours is acknowledged but stores nothing'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const bad = seen.filter((s) => s.status >= 400 && s.sig.includes('t=') && !s.body.includes('selftest') && !s.body.includes('forged'));
    check(bad.length === 0, 'every real event from Stripe was answered with 2xx', bad.map((b) => `${b.type}:${b.status}`).join(','));
  } finally {
    listener.kill();
    server.close();
    // every Sandbox customer this run created (the one with our account and the unrelated one) is deleted again
    const mine = new Set<string>(cust ? [cust] : []);
    for (const e of seen) { try { const c = JSON.parse(e.body).data?.object?.customer; if (typeof c === 'string' && c.startsWith('cus_') && e.type.startsWith('customer.subscription.')) mine.add(c); } catch { /* not json */ } }
    for (const c of mine) await stripe('customers', 'delete', c, '--confirm').then(() => console.log(`\n(cleanup) Sandbox customer ${c} deleted`)).catch(() => console.log('\n(cleanup) could not delete the Sandbox customer ' + c));
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll webhook checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error('\nERROR:', e instanceof Error ? e.message.replace(/(sk|rk|whsec)_[A-Za-z0-9_]+/g, '$1_<hidden>') : e); process.exit(2); });
