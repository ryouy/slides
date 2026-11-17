import { postJson, signInUrl } from '../account/api';
import { getAccount } from '../account/store';
import { operatorReady } from '../legal/operator';
import { gatingOn } from './entitlement';

/**
 * Where a visitor stands with buying Premium:
 *  - 'off'    : no purchase is offered (backend not set up, purchases off on the server, operator details missing, or THIS account
 *               may not buy: the server says so with `canPurchase`). No button is shown.
 *  - 'signin' : everything is ready but the visitor is not signed in yet.
 *  - 'ready'  : signed in and the server allows this account to buy.
 * The browser never decides who may buy: `canPurchase` comes from the server, which also refuses the Checkout itself (403).
 */
export type PurchaseState = 'off' | 'signin' | 'ready';
export function purchaseState(config = getAccount().config, me = getAccount().me): PurchaseState {
  if (!(config.billing && config.purchases && operatorReady())) return 'off';
  // a visitor who is not signed in is only invited to sign in where the paid plan is open to everybody; in the limited test
  // (?tester, paid plan not in this build) the sign-in is offered by the tester box, and no purchase button is shown to anyone
  if (!me?.signedIn) return gatingOn() ? 'signin' : 'off';
  return me.canPurchase === true ? 'ready' : 'off';
}
export const canSubscribe = (config = getAccount().config, me = getAccount().me): boolean => purchaseState(config, me) === 'ready';

/** Subscribe: sign in first (Premium belongs to a Google account), then Stripe Checkout. */
export async function startCheckout(): Promise<boolean> {
  const state = purchaseState();
  if (state === 'off') return false;
  if (state === 'signin') {
    location.assign(signInUrl(location.pathname + location.search)); // back to this page (with its ?tester) after the login
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
