import { useSyncExternalStore } from 'react';
import { fetchConfig, fetchMe, type Config, type Me } from './api';
import { SIGNED_IN_HINT, gatingOn, setEntitlement } from '../premium/entitlement';

/**
 * Account + plan as the server reports them. Nothing is requested unless the paid plan is switched on in
 * this build (VITE_PREMIUM_ENABLED), so a build without it behaves exactly like the old static site.
 */
export interface AccountState {
  /** Backend features that are set up (from /api/config). */
  config: Config;
  me: Me | null;
  /** Looked up at least once. */
  ready: boolean;
}

const HINT = SIGNED_IN_HINT;
let state: AccountState = { config: { auth: false, billing: false }, me: null, ready: false };
const listeners = new Set<() => void>();
const set = (next: AccountState) => {
  state = next;
  listeners.forEach((l) => l());
};

const hint = (v?: boolean): boolean => {
  try {
    if (v === true) localStorage.setItem(HINT, '1');
    else if (v === false) localStorage.removeItem(HINT);
    return localStorage.getItem(HINT) === '1';
  } catch {
    return false;
  }
};

/** Re-reads the plan from the server (after sign-in, Checkout, the portal...). */
export async function refreshAccount(afterCheckout = false): Promise<void> {
  const me = await fetchMe(afterCheckout);
  if (me) hint(me.signedIn);
  set({ ...state, me, ready: true });
  setEntitlement({ premium: !!me?.signedIn && me.premium, loading: false });
}

let started = false;
export async function initAccount(): Promise<void> {
  if (started || !gatingOn()) return;
  started = true;
  if (hint()) setEntitlement({ premium: false, loading: true }); // (already so from the first render; kept for a late start)
  const config = await fetchConfig();
  if (!config?.auth) {
    set({ config: config ?? state.config, me: null, ready: true });
    setEntitlement({ premium: false, loading: false });
    return;
  }
  set({ ...state, config });
  const back = new URLSearchParams(location.search).get('checkout') === 'success';
  await refreshAccount(back);
}

export const getAccount = (): AccountState => state;
export function useAccount(): AccountState {
  return useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), getAccount);
}
