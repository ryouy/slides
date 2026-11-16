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

export const fetchConfig = () => getJson<Config>('/api/config');
export const fetchMe = (refresh = false) => getJson<Me>(refresh ? '/api/billing/status?refresh=1' : '/api/me');

export const signInUrl = (returnTo: string): string => `/api/auth/google?return=${encodeURIComponent(returnTo)}`;

export async function postJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
