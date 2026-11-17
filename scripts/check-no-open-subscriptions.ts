/**
 * READ-ONLY check for the end of the limited live test: no subscription is left that could charge again.
 *
 *   STRIPE_SECRET_KEY=rk_live_... npx vite-node scripts/check-no-open-subscriptions.ts
 *
 * Lists the account's subscriptions from Stripe (GET only; nothing is changed, the key is never printed) and prints, per
 * subscription, its status, whether it is set to end, and when the paid period runs out. Exit code 0 = none of them can bill
 * again; 1 = at least one still can (active / trialing / past_due / unpaid / incomplete / paused), or Stripe could not be read.
 * "active" with cancel_at_period_end is listed as ending: it will not bill again, but it is still Premium until its end date.
 */
import { validStripeKey } from '../worker/env';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
interface Sub { id: string; status: string; cancel_at_period_end?: boolean; cancel_at?: number | null; current_period_end?: number; items?: { data?: { current_period_end?: number }[] }; livemode?: boolean }

const CAN_BILL_AGAIN = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);
const mask = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`;
const day = (t?: number | null) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '-');

export async function checkNoOpenSubscriptions(env: Record<string, string | undefined>, fetchFn: Fetch = fetch, log: (s: string) => void = console.log): Promise<boolean> {
  const key = env.STRIPE_SECRET_KEY;
  if (!validStripeKey(key)) { log('  ✗ STRIPE_SECRET_KEY is missing or not a secret key (sk_… / rk_…)'); return false; }
  const all: Sub[] = [];
  let after = '';
  for (let page = 0; page < 20; page++) { // at most 2000 subscriptions: far more than this site will ever have
    let res: Response;
    try {
      res = await fetchFn(`https://api.stripe.com/v1/subscriptions?status=all&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`, { headers: { authorization: `Bearer ${key}` } });
    } catch { log('  ✗ Could not reach Stripe (network).'); return false; }
    if (res.status === 401 || res.status === 403) { log(`  ✗ Stripe refused the key (${res.status}): it needs permission to READ subscriptions.`); return false; }
    if (!res.ok) { log(`  ✗ Stripe answered ${res.status}.`); return false; }
    const body = (await res.json()) as { data: Sub[]; has_more: boolean };
    all.push(...body.data);
    if (!body.has_more || !body.data.length) break;
    after = body.data[body.data.length - 1].id;
  }
  log(`\n  mode: ${/_live_/.test(key!) ? 'LIVE' : 'test'}   subscriptions found: ${all.length}`);
  let open = 0;
  for (const s of all) {
    const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
    const ending = !!s.cancel_at_period_end || typeof s.cancel_at === 'number';
    const billsAgain = CAN_BILL_AGAIN.has(s.status) && !ending;
    if (billsAgain) open++;
    log(`  ${billsAgain ? '✗' : '✓'} ${mask(s.id)}  status=${s.status}${ending && CAN_BILL_AGAIN.has(s.status) ? '  (set to end — will NOT bill again)' : ''}  period end=${day(end)}`);
  }
  if (open) log(`\n  ✗ ${open} subscription(s) can still bill again: cancel them in the Stripe Dashboard.`);
  else log('\n  ✓ nothing can bill again.');
  return open === 0;
}

if (!process.env.VITEST) checkNoOpenSubscriptions(process.env).then((ok) => process.exit(ok ? 0 : 1));
