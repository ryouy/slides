import { logError } from './safeLog';
import { authConfigured, billingConfigured, checkoutConfigError, parseAllowlist, purchaseAllowed, type Env } from './env';
import { currentUser, finishLogin, logout, startLogin } from './auth';
import { createCheckout, createPortal, deleteAccount, handleWebhook, planFor } from './billing';
import { serveArtwork } from './artwork';
import { handleAppleNotification, serveAppleArtwork } from './apple';
import { handleAppleAccount } from './appleAccount';
import { hmacHex } from './crypto';
import { allow } from './db';
import { err, json, sameOrigin } from './http';
import type { FetchFn } from './stripe';

export interface Deps { fetchFn?: FetchFn }

/** `/api/*` is handled here; everything else is the static site (the Worker only runs for /api/*, see wrangler.jsonc). */
export async function handle(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/config') {
    if (method !== 'GET') return err(405, 'method');
    return json({ auth: authConfigured(env), billing: billingConfigured(env), purchases: billingConfigured(env) && !checkoutConfigError(env) && env.PURCHASES_ENABLED === 'true', ...(authConfigured(env) ? { googleClientId: env.GOOGLE_CLIENT_ID } : {}) });
  }
  if (path === '/api/stripe/webhook') {
    if (method !== 'POST') return err(405, 'method');
    if (!billingConfigured(env)) return err(503, 'not_configured');
    return handleWebhook(request, env, deps.fetchFn); // authenticated by its signature, not by a session
  }
  if (path === '/api/apple/notifications') {
    if (method !== 'POST') return err(405, 'method');
    return handleAppleNotification(request, env); // authenticated by Apple's signature, not by a session
  }
  if (path.startsWith('/api/apple/account-artwork/')) return handleAppleAccount(request, env, deps.fetchFn);
  // iOS account + entitlement API: bearer token, no cookies.  Keep this list
  // explicit so unrelated /api/apple/* paths stay closed, but include every
  // route implemented by appleAccount.ts.
  if (['/api/apple/auth', '/api/apple/google/auth', '/api/apple/sync', '/api/apple/signout', '/api/apple/account/delete', '/api/apple/status', '/api/apple/link/google', '/api/apple/entitlement'].includes(path)) return handleAppleAccount(request, env, deps.fetchFn);
  if (path.startsWith('/api/apple/artwork/')) return serveAppleArtwork(request, env); // authenticated by an Apple-signed transaction
  if (!path.startsWith('/api/auth/') && !['/api/me', '/api/billing/status', '/api/billing/checkout', '/api/billing/portal', '/api/account/delete'].includes(path)) return err(404, 'not_found');
  if (!authConfigured(env)) return err(503, 'not_configured');

  if (path === '/api/auth/google' || path === '/api/auth/callback') {
    if (method !== 'GET') return err(405, 'method');
    // a visitor can start a login now and then, not thousands of times: per address, 40 per 10 minutes
    // the address is never stored: only a keyed hash of it, and only for as long as the 10-minute window (see allow())
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const who = (await hmacHex(env.SESSION_SECRET!, `ip|${ip}`)).slice(0, 32);
    if (!(await allow(env.DB!, `auth:${who}`, 40, 600))) return err(429, 'rate_limited');
    return path === '/api/auth/google' ? startLogin(request, env) : finishLogin(request, env, deps.fetchFn);
  }
  if (path === '/api/auth/logout') {
    if (method !== 'POST') return err(405, 'method');
    if (!sameOrigin(request, env)) return err(403, 'forbidden');
    return json({ ok: true }, 200, Object.fromEntries(await logout(request, env)));
  }

  const user = await currentUser(request, env);
  if (path === '/api/me' || path === '/api/billing/status') {
    if (method !== 'GET') return err(405, 'method');
    if (!user) return json({ signedIn: false, premium: false });
    const plan = await planFor(env, user, { refresh: path === '/api/billing/status' && url.searchParams.get('refresh') === '1', fetchFn: deps.fetchFn });
    // may THIS person buy right now? (purchases on, Stripe set up, and the account is on the allowlist) — decided here, never by the page
    const canPurchase = billingConfigured(env) && env.PURCHASES_ENABLED === 'true' && !checkoutConfigError(env) && purchaseAllowed(env, user.id);
    return json({ ...plan, canPurchase });
  }

  // everything below changes something: it needs a session and a request from our own pages
  if (method !== 'POST') return err(405, 'method');
  if (!sameOrigin(request, env)) return err(403, 'forbidden');
  if (!user) return err(401, 'signin_required');
  if (path === '/api/account/delete') return deleteAccount(env, user, deps.fetchFn);
  if (!billingConfigured(env)) return err(503, 'not_configured');
  if (path === '/api/billing/checkout') {
    if (env.PURCHASES_ENABLED !== 'true') return err(503, 'purchases_disabled');
    const bad = checkoutConfigError(env);
    if (bad) {
      console.error(`checkout refused: ${bad} (check STRIPE_PRICE_ID / STRIPE_SECRET_KEY)`); // a setup mistake: nothing is sent to Stripe
      return err(503, bad);
    }
    if (!purchaseAllowed(env, user.id)) {
      if (parseAllowlist(env.PURCHASE_ALLOWLIST) === null) console.error('checkout refused: neither PUBLIC_SALES=open nor a valid PURCHASE_ALLOWLIST is set (nobody may buy)');
      return err(403, 'not_allowed'); // purchases are limited to the accounts on the allowlist
    }
    return createCheckout(env, user, deps.fetchFn);
  }
  return createPortal(env, user, deps.fetchFn);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/artworks/')) {
      try {
        return await serveArtwork(request, env);
      } catch (e) {
        logError('artwork error', e);
        return env.PREMIUM_ENFORCED === 'true' ? new Response('Unavailable', { status: 503 }) : env.ASSETS.fetch(request); // never break the images while enforcement is off
      }
    }
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handle(request, env);
    } catch (e) {
      logError('api error', e);
      return err(500, 'server_error');
    }
  },
};
