/**
 * Checks, BEFORE purchases are switched on, that the Stripe key and the price belong together and are what the site sells
 * (¥200 per month, same mode). It only READS from Stripe (GET /v1/prices/<id>) and never prints the key.
 *
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ID=price_... npx vite-node scripts/check-stripe.ts
 *
 * Exit code 0 = test-mode key + matching ¥200/month price. Anything else prints why and exits 1.
 */
import { checkoutConfigError, validPriceId, validStripeKey } from '../worker/env';
import { keyIsLive, PREMIUM_PRICE, priceProblem, type StripePrice } from '../worker/priceCheck';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function checkStripe(env: Record<string, string | undefined>, fetchFn: Fetch = fetch, log: (s: string) => void = console.log): Promise<boolean> {
  const key = env.STRIPE_SECRET_KEY;
  const price = env.STRIPE_PRICE_ID;
  const bad = (msg: string) => (log(`  ✗ ${msg}`), false);
  log('');
  if (!validStripeKey(key)) return bad('STRIPE_SECRET_KEY is missing or not a secret key (must start with sk_test_ / sk_live_ / rk_…; a pk_… publishable key will not work)');
  const live = keyIsLive(key!);
  log(`  key mode ........ ${live ? 'LIVE (real money!)' : 'test (no real payments)'}   [${key!.slice(0, 8)}…]`);
  if (!validPriceId(price)) return bad('STRIPE_PRICE_ID is missing or not a price id (must look like price_… ; prod_… is a PRODUCT id and cannot be used; check for spaces)');
  log(`  price id ........ ${price!.slice(0, 10)}…`);
  let p: StripePrice;
  try {
    const res = await fetchFn(`https://api.stripe.com/v1/prices/${encodeURIComponent(price!)}`, { headers: { authorization: `Bearer ${key}` } });
    if (res.status === 404) return bad('Stripe says this price does not exist for this key. A price made in test mode only works with a test key (and the other way round).');
    if (res.status === 401) return bad('Stripe refused the key (wrong, expired or deleted).');
    if (!res.ok) return bad(`Stripe answered ${res.status}.`);
    p = (await res.json()) as StripePrice;
  } catch {
    return bad('Could not reach Stripe (network).');
  }
  log(`  price mode ...... ${p.livemode ? 'LIVE' : 'test'}`);
  log(`  active .......... ${p.active}`);
  log(`  amount .......... ${p.unit_amount} ${String(p.currency).toUpperCase()} / ${p.recurring?.interval_count ?? '-'} ${p.recurring?.interval ?? p.type}`);
  const problem = priceProblem(p, key!);
  if (problem) return bad(`${problem}: expected an active ${PREMIUM_PRICE.amount} ${PREMIUM_PRICE.currency.toUpperCase()} price billed every ${PREMIUM_PRICE.intervalCount} ${PREMIUM_PRICE.interval}, in the same mode as the key`);
  const cfg = checkoutConfigError({ ...env } as never);
  if (cfg === 'live_key_not_allowed') log('  ! a LIVE key: the Worker also needs ALLOW_LIVE_PAYMENTS=true before it will start a Checkout');
  log(live ? '  ✓ price matches the key — LIVE mode: real cards will be charged' : '  ✓ price matches the key — test mode: no real money can move');
  return true;
}

// run as a script (the tests import checkStripe and set VITEST)
if (!process.env.VITEST) {
  checkStripe(process.env).then((ok) => process.exit(ok ? 0 : 1));
}
