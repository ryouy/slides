/**
 * The ONE price this site sells: ¥200 per month. Before a Checkout is created the price behind STRIPE_PRICE_ID is read
 * from Stripe and compared with this and with the mode of the secret key, so a wrong price (another amount, yearly,
 * a live price with a test key...) can never produce a Checkout.
 */
export const PREMIUM_PRICE = { currency: 'jpy', amount: 200, interval: 'month', intervalCount: 1 } as const;

export interface StripePrice {
  id: string;
  active: boolean;
  livemode: boolean;
  currency: string;
  unit_amount: number | null;
  type: string;
  recurring?: { interval: string; interval_count: number } | null;
}

export type PriceProblem = 'price_inactive' | 'price_mode_mismatch' | 'price_not_recurring' | 'price_wrong_amount';

export const keyIsLive = (secretKey: string): boolean => /^(sk|rk)_live_/.test(secretKey);

/** null when the price is exactly what we sell, in the same Stripe mode (test/live) as the key. */
export function priceProblem(p: StripePrice, secretKey: string): PriceProblem | null {
  if (p.livemode !== keyIsLive(secretKey)) return 'price_mode_mismatch';
  if (!p.active) return 'price_inactive';
  if (p.type !== 'recurring' || p.recurring?.interval !== PREMIUM_PRICE.interval || p.recurring?.interval_count !== PREMIUM_PRICE.intervalCount) return 'price_not_recurring';
  if (p.currency !== PREMIUM_PRICE.currency || p.unit_amount !== PREMIUM_PRICE.amount) return 'price_wrong_amount';
  return null;
}
