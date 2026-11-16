/**
 * Who has Premium, decided here (never by the browser).
 *
 * Stripe statuses -> access:
 *  - active, trialing ........ Premium
 *  - past_due ................ Premium only while the period already paid for is still running
 *  - canceled ................ Premium only until the end of the period already paid for
 *                              (cancelling in the portal keeps status "active" with cancel_at_period_end until then)
 *  - unpaid, incomplete, incomplete_expired, paused, anything else ... Free
 */
export interface SubscriptionRow {
  status: string;
  current_period_end: number | null;
  cancel_at_period_end: number;
}

/** Slack for a late renewal webhook; after this a still-"active" row that was never renewed counts as Free. */
export const RENEWAL_GRACE_SECONDS = 2 * 24 * 3600;

export function hasPremium(sub: SubscriptionRow | null | undefined, nowSec: number): boolean {
  if (!sub) return false;
  const end = sub.current_period_end ?? 0;
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return end === 0 || nowSec < end + RENEWAL_GRACE_SECONDS;
    case 'past_due':
    case 'canceled':
      return nowSec < end;
    default:
      return false;
  }
}

/** A subscription that should block starting a second one (the account already has an open contract). */
export const isOpenSubscription = (sub: SubscriptionRow | null | undefined, nowSec: number): boolean =>
  !!sub && (hasPremium(sub, nowSec) || sub.status === 'past_due' || sub.status === 'incomplete');
