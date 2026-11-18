/** Thin client for the Worker API (same origin; the session lives in an HttpOnly cookie the page cannot read). */
export interface Config {
  auth: boolean;
  billing: boolean;
  purchases: boolean;
  /** Public OAuth client id (not a secret): lets the browser ask for Google Drive access. */
  googleClientId?: string;
}
export interface Me {
  signedIn: boolean;
  /** Our own account id (not the Google id). */
  id?: string;
  /** Hint for Google's Drive consent: offer the account that is signed in here. */
  googleSub?: string;
  premium: boolean;
  /** The server's answer to "may this account buy right now?" (purchases on and the account is on the purchase allowlist). */
  canPurchase?: boolean;
  name?: string | null;
  status?: string | null;
  /** unix seconds */
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null; // offline or no backend: the site simply stays Free
  }
}

/**
 * Dev server only (never in a production build): `localStorage['slides:dev-account']` = {"config": {...}, "me": {...}}
 * stands in for the server's answers, so every kind of visitor can be looked at without any backend.
 */
function devAccount(): { config?: Config; me?: Me } | null {
  if (!import.meta.env?.DEV) return null;
  try {
    return JSON.parse(localStorage.getItem('slides:dev-account') ?? 'null');
  } catch {
    return null;
  }
}

export const fetchConfig = () => {
  const d = devAccount();
  return d?.config ? Promise.resolve(d.config) : getJson<Config>('/api/config');
};
export const fetchMe = (refresh = false) => {
  const d = devAccount();
  return d?.me ? Promise.resolve(d.me) : getJson<Me>(refresh ? '/api/billing/status?refresh=1' : '/api/me');
};

export const signInUrl = (returnTo: string): string => `/api/auth/google?return=${encodeURIComponent(returnTo)}`;

/** A POST that keeps the HTTP status and the server's short error code (e.g. "already_subscribed"): for messages the visitor sees. */
export interface PostResult<T> { ok: boolean; status: number; data: T | null; code: string | null }
export async function postForResult<T>(path: string): Promise<PostResult<T>> {
  try {
    const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' } });
    const body = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
    const code = typeof body?.error === 'string' && /^[a-z0-9_]{1,40}$/.test(body.error) ? body.error : null;
    return { ok: res.ok, status: res.status, data: res.ok ? body : null, code };
  } catch {
    return { ok: false, status: 0, data: null, code: 'network' };
  }
}

export async function postJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
