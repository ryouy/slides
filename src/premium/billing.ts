import { postForResult, signInUrl } from '../account/api';
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
export type PurchaseFailure = 'signin' | 'already' | 'pending' | 'busy' | 'failed';
export interface PurchaseOutcome { ok: boolean; failure?: PurchaseFailure; code?: string; status?: number }

/** What the visitor should be told, from the server's answer. */
export function failureOf(status: number, code: string | null): PurchaseFailure {
  if (status === 401) return 'signin';
  if (code === 'already_subscribed') return 'already';
  if (code === 'payment_pending') return 'pending';
  if (status === 429) return 'busy';
  return 'failed';
}

/** Only an https address (Stripe) or a path on this site is ever followed. */
const safeUrl = (u: unknown): u is string => typeof u === 'string' && /^(https:\/\/|\/(?!\/))/.test(u);

export async function startCheckout(): Promise<PurchaseOutcome> {
  const state = purchaseState();
  if (state === 'off') return { ok: false, failure: 'failed', code: 'not_available' };
  if (state === 'signin') {
    location.assign(signInUrl(location.pathname + location.search)); // back to this page (with its ?tester) after the login
    return { ok: true };
  }
  const res = await postForResult<{ url: string }>('/api/billing/checkout');
  const url = res.data?.url;
  if (!res.ok || !safeUrl(url)) {
    return { ok: false, failure: res.ok ? 'failed' : failureOf(res.status, res.code), code: res.ok ? 'no_url' : (res.code ?? `http_${res.status}`), status: res.status };
  }
  location.assign(url);
  return { ok: true };
}

export async function openPortal(): Promise<PurchaseOutcome> {
  const res = await postForResult<{ url: string }>('/api/billing/portal');
  const url = res.data?.url;
  if (!res.ok || !safeUrl(url)) {
    return { ok: false, failure: res.ok ? 'failed' : failureOf(res.status, res.code), code: res.ok ? 'no_url' : (res.code ?? `http_${res.status}`), status: res.status };
  }
  location.assign(url);
  return { ok: true };
}
