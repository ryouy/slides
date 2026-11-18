import { hmacHex, safeEqual } from './crypto';
import type { StripePrice } from './priceCheck';

/** A tiny Stripe REST client (no SDK: fewer dependencies, and `fetch` can be replaced in tests). */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export function formEncode(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? out.push(...formEncode(item as Record<string, unknown>, `${key}[${i}]`)) : out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`)));
    else if (typeof v === 'object') out.push(...formEncode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end?: boolean;
  /** A scheduled end date (set instead of cancel_at_period_end by some portal/API flows). */
  cancel_at?: number | null;
  current_period_end?: number;
  items?: { data?: { current_period_end?: number }[] };
  metadata?: Record<string, string>;
}
/** `current_period_end` moved from the subscription to its items in newer API versions: accept both. */
export const periodEnd = (s: StripeSubscription): number | null => s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
export const customerId = (c: string | { id: string }): string => (typeof c === 'string' ? c : c.id);

/** A short, loggable class of a Stripe failure: derived from the HTTP status only. */
export type StripeErrorKind = 'invalid_request' | 'authentication' | 'permission' | 'not_found' | 'conflict' | 'rate_limit' | 'stripe_unavailable' | 'other';
const kindOf = (status: number): StripeErrorKind =>
  status === 400 ? 'invalid_request' : status === 401 ? 'authentication' : status === 403 ? 'permission' : status === 404 ? 'not_found' : status === 409 ? 'conflict' : status === 429 ? 'rate_limit' : status >= 500 ? 'stripe_unavailable' : 'other';
const TOKEN = /^[a-z0-9_]{1,64}$/;

/**
 * A failed Stripe request. It deliberately carries NO response text: Stripe's error body can quote request details (even part of
 * the API key in a 401), so only the status, its class and Stripe's own short machine codes (`type`, `code`: lowercase words) are kept.
 */
export class StripeError extends Error {
  readonly kind: StripeErrorKind;
  readonly type?: string;
  readonly code?: string;
  constructor(public status: number, responseText = '') {
    super(`Stripe API ${status}`);
    this.kind = kindOf(status);
    try {
      const e = (JSON.parse(responseText) as { error?: { type?: unknown; code?: unknown } }).error;
      if (typeof e?.type === 'string' && TOKEN.test(e.type)) this.type = e.type;
      if (typeof e?.code === 'string' && TOKEN.test(e.code)) this.code = e.code;
    } catch {
      /* not JSON: nothing to keep */
    }
  }
}

export function stripeClient(secretKey: string, fetchFn: FetchFn = (i, init) => fetch(i, init)) {
  async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    const body = params ? formEncode(params).join('&') : undefined;
    const headers: Record<string, string> = { authorization: `Bearer ${secretKey}` };
    if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const res = await fetchFn(`https://api.stripe.com/v1${path}`, { method, headers, body });
    const text = await res.text();
    if (!res.ok) throw new StripeError(res.status, text);
    return JSON.parse(text) as T;
  }
  return {
    createCustomer: (userId: string) => call<{ id: string }>('POST', '/customers', { metadata: { user_id: userId } }, `customer-${userId}`),
    createCheckout: (p: { customer: string; userId: string; price: string; successUrl: string; cancelUrl: string }) =>
      call<{ id: string; url: string }>('POST', '/checkout/sessions', {
        mode: 'subscription',
        customer: p.customer,
        client_reference_id: p.userId,
        line_items: [{ price: p.price, quantity: 1 }],
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        subscription_data: { metadata: { user_id: p.userId } },
        billing_address_collection: 'auto',
      }),
    createPortal: (customer: string, returnUrl: string) => call<{ url: string }>('POST', '/billing_portal/sessions', { customer, return_url: returnUrl }),
    getSubscription: (id: string) => call<StripeSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`),
    listSubscriptions: (customer: string) => call<{ data: StripeSubscription[] }>('GET', `/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=10`),
    getPrice: (id: string) => call<StripePrice>('GET', `/prices/${encodeURIComponent(id)}`),
    listOpenSessions: (customer: string) => call<{ data: { id: string }[] }>('GET', `/checkout/sessions?customer=${encodeURIComponent(customer)}&status=open&limit=10`),
    expireSession: (id: string) => call<{ id: string }>('POST', `/checkout/sessions/${encodeURIComponent(id)}/expire`, {}),
    cancelSubscription: (id: string) => call<StripeSubscription>('DELETE', `/subscriptions/${encodeURIComponent(id)}`),
  };
}
export type StripeClient = ReturnType<typeof stripeClient>;

/**
 * Verifies the `Stripe-Signature` header: HMAC-SHA256 of `<timestamp>.<raw body>` with the endpoint secret,
 * within a 5-minute tolerance. The body must be the exact bytes Stripe sent.
 */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSec: number, toleranceSec = 300): Promise<boolean> {
  if (!header) return false;
  let t = '';
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = v ?? '';
    else if (k === 'v1' && v) sigs.push(v);
  }
  const ts = Number(t);
  if (!t || !Number.isFinite(ts) || sigs.length === 0 || Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => safeEqual(s, expected));
}
