/**
 * READ-ONLY readiness check of the Stripe account behind the key, before general sales (nothing is created or changed; the
 * key is never printed):
 *
 *   STRIPE_SECRET_KEY=rk_live_... STRIPE_PRICE_ID=price_... npx vite-node scripts/check-stripe-live.ts
 *
 * Checks, with GET requests only: the key can read what the Worker reads (prices, customers, subscriptions, Checkout sessions),
 * the price is the ¥200/month one in the key's mode, the webhook endpoint of this site is enabled and subscribed to every event
 * the Worker handles, and the customer portal lets customers cancel (at the period end).
 * What it CANNOT check without side effects: the WRITE permissions (create customers / Checkout sessions / portal sessions,
 * cancel a subscription). They are listed at the end for you to confirm in the Dashboard (Developers → API keys → the key).
 * Exit code 0 = everything checked is fine; 1 = something needs fixing.
 */
import { HANDLED_EVENTS } from '../worker/billing';
import { validPriceId, validStripeKey } from '../worker/env';
import { keyIsLive, PREMIUM_PRICE, priceProblem, type StripePrice } from '../worker/priceCheck';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
/** Without these the Worker would miss a purchase, a change or an end of a contract. The other handled events (paused, resumed, payment_succeeded) only repeat what these carry. */
const CORE_EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'];

export async function checkStripeLive(env: Record<string, string | undefined>, fetchFn: Fetch = fetch, log: (s: string) => void = console.log): Promise<boolean> {
  const key = env.STRIPE_SECRET_KEY;
  const priceId = env.STRIPE_PRICE_ID;
  const site = (env.SITE_URL || 'https://slides.ryouy.workers.dev').replace(/\/+$/, '');
  let bad = 0;
  const ok = (m: string) => log(`  ✓ ${m}`);
  const no = (m: string) => { bad++; log(`  ✗ ${m}`); };
  if (!validStripeKey(key)) { no('STRIPE_SECRET_KEY is missing or not a secret key (sk_… / rk_…)'); return false; }
  const live = keyIsLive(key!);
  log(`\n  key mode: ${live ? 'LIVE' : 'test'}   site: ${site}`);

  const get = async (path: string): Promise<{ status: number; body: any } | null> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const res = await fetchFn(`https://api.stripe.com/v1${path}`, { headers: { authorization: `Bearer ${key}` } });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    } catch { return null; }
  };
  const first = await get('/prices?limit=1');
  if (!first) { no('Could not reach Stripe (network).'); return false; }
  if (first.status === 401) { no('Stripe refused the key (wrong, expired or deleted).'); return false; }

  log('\n  Read permissions the Worker uses');
  for (const [label, path] of [['prices', '/prices?limit=1'], ['customers', '/customers?limit=1'], ['subscriptions', '/subscriptions?limit=1'], ['Checkout sessions', '/checkout/sessions?limit=1']] as const) {
    const r = await get(path);
    if (r?.status === 200) ok(`can read ${label}`);
    else no(`cannot read ${label} (HTTP ${r?.status ?? 'network'}): give the key “Read” on it`);
  }

  log('\n  Price');
  if (!validPriceId(priceId)) no('STRIPE_PRICE_ID is missing or not a price id (price_…)');
  else {
    const r = await get(`/prices/${encodeURIComponent(priceId!)}`);
    if (r?.status !== 200) no(`the price cannot be read (HTTP ${r?.status ?? 'network'}); it must exist in the same mode as the key`);
    else {
      const p = r.body as StripePrice;
      const problem = priceProblem(p, key!);
      if (problem) no(`${problem}: expected an active ${PREMIUM_PRICE.amount} ${PREMIUM_PRICE.currency.toUpperCase()} price every ${PREMIUM_PRICE.intervalCount} ${PREMIUM_PRICE.interval}, same mode as the key`);
      else ok(`active ¥${PREMIUM_PRICE.amount} per month, ${p.livemode ? 'live' : 'test'} mode (matches the key)`);
    }
  }

  log('\n  Webhook endpoint');
  const eps = await get('/webhook_endpoints?limit=100');
  if (eps?.status !== 200) no(`cannot list webhook endpoints (HTTP ${eps?.status ?? 'network'}): give the key “Read” on Webhook endpoints, or check this in the Dashboard`);
  else {
    const url = `${site}/api/stripe/webhook`;
    const mine = (eps.body.data as { url: string; status: string; livemode: boolean; enabled_events: string[] }[]).filter((e) => e.url === url);
    if (!mine.length) no(`no endpoint with the URL ${url}`);
    for (const e of mine) {
      if (e.status !== 'enabled') no(`the endpoint for ${url} is “${e.status}”, not enabled`);
      else if (e.livemode !== live) no(`the endpoint is ${e.livemode ? 'live' : 'test'}-mode but the key is ${live ? 'live' : 'test'}`);
      else {
        const all = e.enabled_events.includes('*');
        const missing = HANDLED_EVENTS.filter((t) => !all && !e.enabled_events.includes(t));
        const core = missing.filter((t) => CORE_EVENTS.includes(t));
        const extra = missing.filter((t) => !CORE_EVENTS.includes(t));
        if (core.length) no(`the endpoint does not subscribe to events the Worker needs: ${core.join(', ')}`);
        else ok(`enabled, ${live ? 'live' : 'test'} mode, subscribed to every event the Worker needs${all ? ' (via “all events”)' : ''}`);
        if (extra.length && !core.length) log(`  ! optional events not subscribed (harmless: the subscription events already carry the state): ${extra.join(', ')}`);
      }
    }
  }

  log('\n  Customer portal');
  const cfgs = await get('/billing_portal/configurations?limit=20');
  if (cfgs?.status !== 200) no(`cannot read portal configurations (HTTP ${cfgs?.status ?? 'network'}): give the key “Read” on Customer portal, or check this in the Dashboard`);
  else {
    const list = (cfgs.body.data as { id: string; active: boolean; is_default: boolean; livemode: boolean; features?: { subscription_cancel?: { enabled?: boolean; mode?: string } } }[]).filter((c) => c.active);
    const def = list.find((c) => c.is_default) ?? list[0];
    if (!def) no('there is no active portal configuration: save the portal settings in the Dashboard (Settings → Billing → Customer portal)');
    else {
      const cancel = def.features?.subscription_cancel;
      if (!cancel?.enabled) no('the default portal configuration does not let customers cancel subscriptions (turn on “Cancel subscriptions”)');
      else if (cancel.mode !== 'at_period_end') no(`customers cancel “${cancel.mode}”: choose “at end of billing period” so paid time is kept (the terms promise access until the paid period ends)`);
      else ok('customers can cancel, at the end of the billing period');
    }
  }

  log('\n  Not checkable without side effects: confirm these WRITE permissions on the key in the Dashboard');
  log('   · Customers: write · Checkout Sessions: write · Customer portal: write · Subscriptions: write (the Worker cancels one when an account is deleted)');
  log(bad ? `\n  ✗ ${bad} problem(s) to fix before general sales` : '\n  ✓ everything that can be checked read-only is fine');
  return bad === 0;
}

if (!process.env.VITEST) checkStripeLive(process.env).then((ok) => process.exit(ok ? 0 : 1));
