import type { Env } from './env';
import { b64urlDecode, randomToken, safeEqual, sha256B64url, signValue, verifyValue } from './crypto';
import { createSession, deleteSession, nowSec, upsertGoogleUser, userForSession, type UserRow } from './db';
import { isSecure, parseCookies, redirect, safeReturnPath, serializeCookie, sessionCookieName } from './http';
import type { FetchFn } from './stripe';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_COOKIE = 'slides_oauth';
const OAUTH_TTL = 600;

interface OAuthState { state: string; nonce: string; verifier: string; ret: string; exp: number }

export const redirectUri = (env: Env): string => `${(env.SITE_URL ?? '').replace(/\/+$/, '')}/api/auth/callback`;

/** Step 1: Authorization Code flow with PKCE. State, nonce and the PKCE verifier travel in a signed, short-lived cookie. */
export async function startLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const payload: OAuthState = { state, nonce, verifier, ret: safeReturnPath(url.searchParams.get('return')), exp: nowSec() + OAUTH_TTL };
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(env),
    response_type: 'code',
    scope: 'openid profile',
    state,
    nonce,
    code_challenge: await sha256B64url(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  const headers = new Headers();
  headers.append('set-cookie', serializeCookie(OAUTH_COOKIE, await signValue(env.SESSION_SECRET!, payload), { secure: isSecure(env), path: '/api/auth', maxAge: OAUTH_TTL }));
  return redirect(`${AUTH_URL}?${params}`, headers);
}

export interface IdClaims { iss?: string; aud?: string; sub?: string; exp?: number; nonce?: string; name?: string }
export function decodeClaims(idToken: string): IdClaims | null {
  const part = idToken.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(part))) as IdClaims;
  } catch {
    return null;
  }
}
/** The ID token comes straight from Google's token endpoint over TLS; issuer, audience, expiry and nonce are still checked. */
export function claimsValid(c: IdClaims | null, clientId: string, nonce: string, now: number): c is IdClaims & { sub: string } {
  return !!c && (c.iss === 'https://accounts.google.com' || c.iss === 'accounts.google.com') && c.aud === clientId && !!c.sub && typeof c.exp === 'number' && c.exp > now && c.nonce === nonce;
}

/** Step 2: Google sends the visitor back with a code. */
export async function finishLogin(request: Request, env: Env, fetchFn: FetchFn = (i, init) => fetch(i, init)): Promise<Response> {
  const url = new URL(request.url);
  const clear = serializeCookie(OAUTH_COOKIE, '', { secure: isSecure(env), path: '/api/auth', maxAge: 0 });
  const fail = (reason: string) => redirect(`/?auth=${reason}`, new Headers({ 'set-cookie': clear }));

  const saved = await verifyValue<OAuthState>(env.SESSION_SECRET!, parseCookies(request.headers.get('cookie'))[OAUTH_COOKIE]);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error')) return fail('denied');
  if (!saved || saved.exp < nowSec() || !code || !safeEqual(state, saved.state)) return fail('invalid');

  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(env),
      grant_type: 'authorization_code',
      code_verifier: saved.verifier,
    }).toString(),
  });
  if (!res.ok) return fail('failed');
  const tokens = (await res.json()) as { id_token?: string };
  const claims = tokens.id_token ? decodeClaims(tokens.id_token) : null;
  if (!claimsValid(claims, env.GOOGLE_CLIENT_ID!, saved.nonce, nowSec())) return fail('invalid');

  const user = await upsertGoogleUser(env.DB!, claims.sub, claims.name?.slice(0, 80) ?? null);
  const token = randomToken(32);
  await createSession(env.DB!, token, user.id);
  const headers = new Headers();
  headers.append('set-cookie', clear);
  headers.append('set-cookie', serializeCookie(sessionCookieName(env), token, { secure: isSecure(env), maxAge: 30 * 24 * 3600 }));
  return redirect(saved.ret, headers);
}

export const sessionToken = (request: Request, env: Env): string | undefined => parseCookies(request.headers.get('cookie'))[sessionCookieName(env)];

export async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  return userForSession(env.DB!, sessionToken(request, env));
}

export async function logout(request: Request, env: Env): Promise<Headers> {
  await deleteSession(env.DB!, sessionToken(request, env));
  return new Headers({ 'set-cookie': serializeCookie(sessionCookieName(env), '', { secure: isSecure(env), maxAge: 0 }) });
}
