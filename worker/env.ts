/** The few Cloudflare types the Worker uses (kept local so the site build needs no extra packages). */
export interface D1Result<T = unknown> { results?: T[]; success: boolean; meta?: { changes?: number } }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}
export interface Fetcher { fetch(request: Request): Promise<Response> }

export interface Env {
  /** Static site (the built `dist`). */
  ASSETS: Fetcher;
  /** D1 database binding. Absent until the database is created and bound: the API then answers 503. */
  DB?: D1Database;
  // Secrets / variables (see README "Premium: setup")
  SITE_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  /** "true" lets visitors start a purchase. Stays "false" until the commercial-law notice and the tests are done. */
  PURCHASES_ENABLED?: string;
  /** "true" makes full-size Premium paintings need a Premium account (set together with VITE_PREMIUM_ENABLED). */
  PREMIUM_ENFORCED?: string;
  /**
   * Who may start a purchase: account ids (the `id` that /api/me shows to the signed-in person), separated by commas or spaces.
   * Unset, empty or malformed (any entry that is not an id) = NOBODY may buy. Set as a Cloudflare Secret.
   */
  PURCHASE_ALLOWLIST?: string;
  /** "true" allows a LIVE Stripe key (real money). Absent/anything else: only test keys can start a Checkout. */
  ALLOW_LIVE_PAYMENTS?: string;
}

const ALLOW_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const ALLOWLIST_MAX = 20;
/** The allowed account ids, or null when the setting is unset, empty or malformed (then nobody may buy). Never logs the values. */
export function parseAllowlist(raw: string | undefined): Set<string> | null {
  const items = (raw ?? '').split(/[\s,]+/).filter(Boolean);
  if (!items.length || items.length > ALLOWLIST_MAX || !items.every((i) => ALLOW_ID.test(i))) return null;
  return new Set(items);
}
export const purchaseAllowed = (e: Env, userId: string): boolean => parseAllowlist(e.PURCHASE_ALLOWLIST)?.has(userId) ?? false;

export const authConfigured = (e: Env): boolean => !!(e.DB && e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.SESSION_SECRET && e.SITE_URL);
/** A Stripe PRICE id looks like price_… . A product id (prod_…) or anything else is a setup mistake, never sent to Stripe. */
export const validPriceId = (id: string | undefined): boolean => !!id && /^price_[A-Za-z0-9]{6,}$/.test(id);
/** Secret keys: sk_… or restricted rk_… (never a publishable pk_… key, which cannot create sessions). */
export const validStripeKey = (k: string | undefined): boolean => !!k && /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/.test(k);

/** Why Checkout cannot start although everything is "set": a wrong value (shown in the API answer and the log, never the value itself). */
export function checkoutConfigError(e: Env): 'invalid_price_id' | 'invalid_stripe_key' | 'live_key_not_allowed' | null {
  if (!validPriceId(e.STRIPE_PRICE_ID)) return 'invalid_price_id';
  if (!validStripeKey(e.STRIPE_SECRET_KEY)) return 'invalid_stripe_key';
  if (/^(sk|rk)_live_/.test(e.STRIPE_SECRET_KEY!) && e.ALLOW_LIVE_PAYMENTS !== 'true') return 'live_key_not_allowed'; // real money needs a deliberate second switch
  return null;
}

export const billingConfigured = (e: Env): boolean => !!(authConfigured(e) && e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET && e.STRIPE_PRICE_ID);
