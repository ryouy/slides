import { postJson, signInUrl } from '../account/api';
import { getAccount } from '../account/store';
import { gatingOn } from './entitlement';

/** Can a visitor buy Premium here? Needs the paid plan on in this build AND the backend (Google + Stripe) configured. */
export const billingAvailable = (): boolean => gatingOn() && getAccount().config.billing;

/** Subscribe: sign in first (Premium belongs to a Google account), then Stripe Checkout. */
export async function startCheckout(): Promise<boolean> {
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
