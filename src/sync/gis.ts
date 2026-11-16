import { DRIVE_SCOPE } from './drive';

/**
 * Google Identity Services "token model": the browser asks Google for a short-lived access token for the
 * `drive.appdata` scope. The token lives in memory only (never in storage, a URL or a log) and expires after
 * about an hour; the site's server never sees it and no refresh token is kept anywhere.
 * Drive access is a separate, optional consent: signing in alone never asks for it.
 */
interface TokenResponse { access_token?: string; expires_in?: number | string; error?: string }
interface TokenClient { requestAccessToken(overrides?: { prompt?: string }): void }
interface GoogleOAuth2 {
  initTokenClient(c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string }) => void }): TokenClient;
  revoke(token: string, done?: () => void): void;
}
declare global {
  interface Window { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleOAuth2 | null> | null = null;
let token: { value: string; expiresAt: number } | null = null;

function loadGis(): Promise<GoogleOAuth2 | null> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve(window.google?.accounts?.oauth2 ?? null);
    s.onerror = () => { loading = null; resolve(null); }; // blocked or offline: sync simply stays unavailable
    document.head.appendChild(s);
  });
  return loading;
}

/** A valid token, or null when the visitor must be asked: `interactive` may open Google's consent popup (needs a click). */
export async function getDriveToken(clientId: string, interactive: boolean): Promise<string | null> {
  if (token && token.expiresAt - Date.now() > 60_000) return token.value;
  const oauth2 = await loadGis();
  if (!oauth2) return null;
  return new Promise((resolve) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r.access_token) {
          token = { value: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
          resolve(r.access_token);
        } else resolve(null);
      },
      error_callback: () => resolve(null),
    });
    client.requestAccessToken({ prompt: interactive ? '' : 'none' });
  });
}

/** Withdraws Drive access: the token is revoked at Google and forgotten. */
export async function revokeDriveAccess(): Promise<void> {
  const t = token?.value;
  token = null;
  if (!t) return;
  const oauth2 = window.google?.accounts?.oauth2;
  if (oauth2) await new Promise<void>((done) => oauth2.revoke(t, () => done()));
}

export const forgetDriveToken = (): void => { token = null; };
