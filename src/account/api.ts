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

export async function postJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
