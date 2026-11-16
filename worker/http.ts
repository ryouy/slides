import type { Env } from './env';

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });

export const err = (status: number, code: string): Response => json({ error: code }, status);

export function redirect(location: string, headers: Headers = new Headers()): Response {
  headers.set('location', location);
  headers.set('cache-control', 'no-store');
  return new Response(null, { status: 302, headers });
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export interface CookieOptions { maxAge?: number; path?: string }
export function serializeCookie(name: string, value: string, o: CookieOptions & { secure: boolean }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`, 'HttpOnly', 'SameSite=Lax'];
  if (o.secure) parts.push('Secure');
  if (o.maxAge !== undefined) parts.push(`Max-Age=${o.maxAge}`);
  return parts.join('; ');
}

/** `__Host-` cookies need HTTPS; plain http (local dev on localhost) uses the bare name. */
export const isSecure = (env: Env): boolean => (env.SITE_URL ?? '').startsWith('https://');
export const sessionCookieName = (env: Env): string => (isSecure(env) ? '__Host-slides_session' : 'slides_session');

/**
 * CSRF guard for state-changing requests: the request must come from this site. The browser sets
 * Origin (or Sec-Fetch-Site) itself and a foreign page cannot forge it, and we send no CORS headers.
 */
export function sameOrigin(request: Request, env: Env): boolean {
  const site = new URL(env.SITE_URL ?? request.url).origin;
  const origin = request.headers.get('origin');
  if (origin) return origin === site;
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';
  return false;
}

/** Only same-site relative paths may be used as a post-login destination (no open redirect). */
export function safeReturnPath(p: string | null | undefined): string {
  if (!p || !p.startsWith('/') || p.startsWith('//') || p.includes('\\') || /[\r\n]/.test(p)) return '/';
  return p;
}
