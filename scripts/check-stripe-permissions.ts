/**
 * Which Stripe permissions does the key really have, compared with the ones the Worker needs?
 *
 *   STRIPE_SECRET_KEY=rk_live_... STRIPE_PRICE_ID=price_... npx vite-node scripts/check-stripe-permissions.ts
 *   PROBE_WRITES=1 STRIPE_SECRET_KEY=... npx vite-node scripts/check-stripe-permissions.ts     (also probes the WRITE permissions)
 *
 * Default: GET requests only (nothing can change). It reports (a) the READ permissions the Worker needs and (b) the READ
 * permissions the key has beyond what the Worker needs.
 * With PROBE_WRITES=1 it also sends write requests that CANNOT succeed (a nonexistent id, or no required parameter), so nothing is
 * created, changed, deleted or charged: Stripe checks the key's permission first, so “permission error (403)” = the key lacks the
 * write permission, while “invalid / not found (400/404)” = it has it. The key is never printed.
 * Exit code 0 = every permission the Worker needs is there; the extras are only reported (remove them in the Dashboard).
 */
import { validStripeKey } from '../worker/env';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** What the Worker calls (worker/stripe.ts): 9 requests in all. */
export const NEEDED: { permission: string; uses: string; probe: { method: 'GET' | 'POST' | 'DELETE'; path: string; body?: string } }[] = [
  { permission: 'Prices — Read', uses: 'GET /v1/prices/{id} (is it the ¥200 monthly price?)', probe: { method: 'GET', path: '/prices?limit=1' } },
  { permission: 'Customers — Write', uses: 'POST /v1/customers (one Stripe customer per account; probed on a nonexistent customer id)', probe: { method: 'POST', path: '/customers/cus_zzprobe_nonexistent', body: 'description=probe' } },
  { permission: 'Subscriptions — Read', uses: 'GET /v1/subscriptions, GET /v1/subscriptions/{id} (the webhook re-reads the contract)', probe: { method: 'GET', path: '/subscriptions?limit=1' } },
  { permission: 'Subscriptions — Write', uses: 'DELETE /v1/subscriptions/{id} (only when an account is deleted)', probe: { method: 'DELETE', path: '/subscriptions/sub_zzprobe_nonexistent' } },
  { permission: 'Checkout Sessions — Read', uses: 'GET /v1/checkout/sessions (find an open payment page)', probe: { method: 'GET', path: '/checkout/sessions?limit=1' } },
  { permission: 'Checkout Sessions — Write', uses: 'POST /v1/checkout/sessions and …/{id}/expire', probe: { method: 'POST', path: '/checkout/sessions/cs_zzprobe_nonexistent/expire', body: '' } },
  { permission: 'Customer portal — Write', uses: 'POST /v1/billing_portal/sessions (the “Manage subscription” button)', probe: { method: 'POST', path: '/billing_portal/sessions', body: 'customer=cus_zzprobe_nonexistent&return_url=https%3A%2F%2Fexample.com' } },
];

/** Things the Worker never touches: a key that can do them has more power than it needs. (GET probes first; writes only with PROBE_WRITES=1.) */
export const EXTRAS: { permission: string; probe: { method: 'GET' | 'POST' | 'DELETE'; path: string; body?: string } }[] = [
  { permission: 'Balance — Read', probe: { method: 'GET', path: '/balance' } },
  { permission: 'Charges — Read', probe: { method: 'GET', path: '/charges?limit=1' } },
  { permission: 'PaymentIntents — Read', probe: { method: 'GET', path: '/payment_intents?limit=1' } },
  { permission: 'Invoices — Read', probe: { method: 'GET', path: '/invoices?limit=1' } },
  { permission: 'Refunds — Read', probe: { method: 'GET', path: '/refunds?limit=1' } },
  { permission: 'Payouts — Read', probe: { method: 'GET', path: '/payouts?limit=1' } },
  { permission: 'Disputes — Read', probe: { method: 'GET', path: '/disputes?limit=1' } },
  { permission: 'Events — Read', probe: { method: 'GET', path: '/events?limit=1' } },
  { permission: 'Products — Read', probe: { method: 'GET', path: '/products?limit=1' } },
  { permission: 'Coupons — Read', probe: { method: 'GET', path: '/coupons?limit=1' } },
  { permission: 'Webhook endpoints — Read', probe: { method: 'GET', path: '/webhook_endpoints?limit=1' } },
  { permission: 'Payment methods — Read', probe: { method: 'GET', path: '/payment_methods?limit=1&type=card' } },
];
export const EXTRA_WRITES: typeof EXTRAS = [
  { permission: 'Refunds — Write', probe: { method: 'POST', path: '/refunds', body: '' } },
  { permission: 'PaymentIntents — Write', probe: { method: 'POST', path: '/payment_intents', body: '' } },
  { permission: 'Products — Write', probe: { method: 'POST', path: '/products', body: '' } },
  { permission: 'Prices — Write', probe: { method: 'POST', path: '/prices', body: '' } },
  { permission: 'Coupons — Write', probe: { method: 'POST', path: '/coupons', body: '' } },
  { permission: 'Payouts — Write', probe: { method: 'POST', path: '/payouts', body: '' } },
  { permission: 'Transfers — Write', probe: { method: 'POST', path: '/transfers', body: '' } },
  { permission: 'Webhook endpoints — Write', probe: { method: 'POST', path: '/webhook_endpoints', body: '' } },
  { permission: 'Customers — Delete', probe: { method: 'DELETE', path: '/customers/cus_zzprobe_nonexistent' } },
  { permission: 'Invoices — Write', probe: { method: 'POST', path: '/invoices/in_zzprobe_nonexistent/void', body: '' } },
  { permission: 'Charges — Write', probe: { method: 'POST', path: '/charges/ch_zzprobe_nonexistent/capture', body: '' } },
];

type Verdict = 'allowed' | 'denied' | 'badkey' | 'unknown';
async function probe(key: string, fetchFn: Fetch, p: { method: string; path: string; body?: string }): Promise<Verdict> {
  let res: Response;
  try {
    res = await fetchFn(`https://api.stripe.com/v1${p.path}`, { method: p.method, headers: { authorization: `Bearer ${key}`, ...(p.method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: p.method === 'POST' ? (p.body ?? '') : undefined });
  } catch {
    return 'unknown';
  }
  const text = await res.text().catch(() => '');
  if (res.status === 401) return 'badkey';
  if (res.status === 403 || /permission_error|does not have the required permissions/i.test(text)) return 'denied';
  if (res.ok || res.status === 400 || res.status === 404) return 'allowed'; // a read worked, or a request that cannot succeed was judged on its content
  return 'unknown';
}

export async function checkStripePermissions(env: Record<string, string | undefined>, fetchFn: Fetch = fetch, log: (s: string) => void = console.log): Promise<boolean> {
  const key = env.STRIPE_SECRET_KEY;
  if (!validStripeKey(key)) { log('  ✗ STRIPE_SECRET_KEY is missing or not a secret key (sk_… / rk_…)'); return false; }
  const writes = env.PROBE_WRITES === '1';
  log(`\n  key mode: ${/_live_/.test(key!) ? 'LIVE' : 'test'}   probing writes: ${writes ? 'yes (requests that cannot succeed)' : 'no (GET only)'}`);
  let missing = 0;
  let unknown = 0;

  log('\n  Needed by the Worker');
  for (const n of NEEDED) {
    if (!writes && n.probe.method !== 'GET') { log(`  · ${n.permission}  — ${n.uses}   (not probed: set PROBE_WRITES=1)`); continue; }
    const v = await probe(key!, fetchFn, n.probe);
    if (v === 'badkey') { log('  ✗ Stripe refused the key (wrong, expired or deleted).'); return false; }
    if (v === 'allowed') log(`  ✓ ${n.permission}  — ${n.uses}`);
    else if (v === 'denied') { missing++; log(`  ✗ ${n.permission} is MISSING  — ${n.uses}`); }
    else { unknown++; log(`  ? ${n.permission}  — could not tell (network or unexpected answer)`); }
  }

  log('\n  Granted but NOT needed (can be removed in the Dashboard)');
  const extra: string[] = [];
  for (const e of writes ? [...EXTRAS, ...EXTRA_WRITES] : EXTRAS) {
    const v = await probe(key!, fetchFn, e.probe);
    if (v === 'allowed') { extra.push(e.permission); log(`  ! ${e.permission}`); }
    else if (v === 'unknown') unknown++;
  }
  if (!extra.length) log('  ✓ none of the probed extras');
  log(`\n  ${missing ? `✗ ${missing} needed permission(s) missing` : '✓ every permission checked that the Worker needs is present'}${extra.length ? `; ${extra.length} extra permission(s) found` : ''}${unknown ? `; ${unknown} probe(s) inconclusive` : ''}`);
  if (!writes) log('  (the write permissions were not probed: run again with PROBE_WRITES=1)');
  return missing === 0;
}

if (!process.env.VITEST) checkStripePermissions(process.env).then((ok) => process.exit(ok ? 0 : 1));
