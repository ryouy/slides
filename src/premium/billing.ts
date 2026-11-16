import { postJson, signInUrl } from '../account/api';
import { getAccount } from '../account/store';
import { operatorReady } from '../legal/operator';
import { gatingOn } from './entitlement';

/**
 * Can a visitor buy Premium here? All of: the paid plan is on in this build, the backend (Google + Stripe) is set up,
 * the server has purchases switched on (PURCHASES_ENABLED), and the operator details for the commercial-law notice are filled in.
 */
export const canSubscribe = (config = getAccount().config): boolean => gatingOn() && config.billing && config.purchases && operatorReady();

/** Subscribe: sign in first (Premium belongs to a Google account), then Stripe Checkout. */
export async function startCheckout(): Promise<boolean> {
  if (!canSubscribe()) return false;
  const me = getAccount().me;
  if (!me?.signedIn) {
    location.assign(signInUrl('/art-slide/premium'));
    return true;
  }
  const res = await postJson<{ url: string }>('/api/billing/checkout');
  if (!res?.url) return false;
  location.assign(res.url);
  return true;
}

export async function openPortal(): Promise<boolean> {
  const res = await postJson<{ url: string }>('/api/billing/portal');
  if (!res?.url) return false;
  location.assign(res.url);
  return true;
}
