import type { Env } from './env';
import { billingConfigured, stripeLivemode } from './env';
import { allow, copyLegacySubscription, deleteUser, eventSeen, getLegacySubscription, getStripeCustomer, getSubscription, giveBack, markEvent, nowSec, putStripeCustomer, saveSubscription, userByCustomer, userById, type UserRow } from './db';
import { hasPremium, isOpenSubscription, type SubscriptionRow } from './entitlement';
import { err, json } from './http';
import { priceProblem } from './priceCheck';
import { logError } from './safeLog';
import { customerId, periodEnd, StripeError, stripeClient, verifyStripeSignature, type FetchFn, type StripeClient, type StripeSubscription } from './stripe';

const REFRESH_AFTER = 600; // seconds: how old a row may be before an expired period is re-checked with Stripe

export interface PlanInfo {
  signedIn: true;
  id: string;
  /** The visitor's own Google id: only used as a hint so Google offers the same account for Drive access. */
  googleSub: string;
  name: string | null;
  premium: boolean;
  status: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

/** Writes Stripe's current view of a subscription into D1 (the one place access is recorded). */
export async function syncSubscription(env: Env, sub: StripeSubscription, hintUserId?: string): Promise<boolean> {
  const db = env.DB!;
  const live = stripeLivemode(env);
  if (typeof sub.livemode === 'boolean' && sub.livemode !== (live === 1)) return false; // an object of the OTHER Stripe mode never lands on this mode's record
  const cust = customerId(sub.customer);
  let user: UserRow | null = null;
  const metaId = sub.metadata?.user_id ?? hintUserId;
  if (metaId) user = await userById(db, metaId);
  if (!user) user = await userByCustomer(db, cust);
  if (!user) return false; // not ours (e.g. a test event for another product)
  // a customer is tied to one account per mode for good: a subscription of a different customer never lands on this account
  const mapped = await getStripeCustomer(db, user.id, live);
  if (mapped && mapped !== cust) return false;
  if (!mapped) await putStripeCustomer(db, user.id, live, cust);
  const saved = await saveSubscription(
    db,
    user.id,
    live,
    { stripe_subscription_id: sub.id, status: sub.status, current_period_end: periodEnd(sub), cancel_at_period_end: !!sub.cancel_at_period_end || typeof sub.cancel_at === 'number' },
    (r: SubscriptionRow) => hasPremium(r, nowSec()),
  );
  if (!saved) console.error(`duplicate_subscription: ${sub.id} ignored, the account already has an active one (cancel/refund it in Stripe)`);
  return true;
}

/** Re-reads the account's subscription from Stripe (used after Checkout and when a stored period has run out). */
async function refreshFromStripe(env: Env, stripe: StripeClient, user: UserRow): Promise<void> {
  const cust = await customerFor(env, stripe, user, false);
  if (!cust) return;
  const list = await stripe.listSubscriptions(cust);
  const best = list.data.find((s) => hasPremium({ status: s.status, current_period_end: periodEnd(s), cancel_at_period_end: s.cancel_at_period_end ? 1 : 0 }, nowSec())) ?? list.data[0];
  if (best) await syncSubscription(env, best, user.id);
}

/**
 * A row of the OLD single-mode table (saved before modes were kept apart): its mode is unknown, so ask Stripe once. It exists in
 * THIS mode -> it is this mode's subscription; Stripe says "no such subscription" -> it belongs to the other mode and is filed there.
 * The old row itself is never changed or deleted. Until then it grants nothing.
 */
async function importLegacySubscription(env: Env, stripe: StripeClient, user: UserRow, live: 0 | 1): Promise<void> {
  const legacy = await getLegacySubscription(env.DB!, user.id);
  if (!legacy) return;
  const filedAsOther = await getSubscription(env.DB!, user.id, (1 - live) as 0 | 1);
  if (filedAsOther?.stripe_subscription_id === legacy.stripe_subscription_id) return; // already classified
  try {
    await syncSubscription(env, await stripe.getSubscription(legacy.stripe_subscription_id), user.id);
  } catch (e) {
    if (!isMissing(e)) throw e;
    await copyLegacySubscription(env.DB!, user.id, (1 - live) as 0 | 1);
  }
}

export async function planFor(env: Env, user: UserRow, opts: { refresh?: boolean; fetchFn?: FetchFn } = {}): Promise<PlanInfo> {
  const live = stripeLivemode(env);
  let sub = await getSubscription(env.DB!, user.id, live);
  if (!sub && billingConfigured(env)) {
    try {
      await importLegacySubscription(env, stripeClient(env.STRIPE_SECRET_KEY!, opts.fetchFn), user, live);
      sub = await getSubscription(env.DB!, user.id, live);
    } catch (e) {
      logError('legacy subscription check failed', e);
    }
  }
  const stale = !!sub && nowSec() >= (sub.current_period_end ?? 0) && nowSec() - sub.updated_at > REFRESH_AFTER && ['active', 'past_due', 'trialing'].includes(sub.status);
  if ((opts.refresh || stale) && billingConfigured(env)) {
    try {
      await refreshFromStripe(env, stripeClient(env.STRIPE_SECRET_KEY!, opts.fetchFn), user);
      sub = await getSubscription(env.DB!, user.id, live);
    } catch (e) {
      logError('stripe refresh failed', e);
    }
  }
  return {
    signedIn: true,
    id: user.id,
    googleSub: user.google_sub,
    name: user.name,
    premium: hasPremium(sub, nowSec()),
    status: sub?.status ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
  };
}

/**
 * The Stripe customer of this account in THIS Stripe mode (the key's), or null. Customer ids of the test and the live world are
 * different objects, so they are kept apart (table stripe_customers, one per account and mode) and one mode's id is never used
 * with the other mode's key. An id from the old single column is checked against Stripe once: found -> it belongs to this mode;
 * "no such customer" -> it belongs to the other mode and is filed there (kept, never deleted), and only then, if asked to, a
 * new customer is created. A customer that is already filed for this mode but missing at Stripe is NOT silently replaced.
 */
async function customerFor(env: Env, stripe: StripeClient, user: UserRow, create: boolean): Promise<string | null> {
  const db = env.DB!;
  const live = stripeLivemode(env);
  const mapped = await getStripeCustomer(db, user.id, live);
  if (mapped) return mapped;
  const legacy = user.stripe_customer_id;
  if (legacy && legacy !== (await getStripeCustomer(db, user.id, (1 - live) as 0 | 1))) {
    try {
      const c = await stripe.getCustomer(legacy);
      if (!c.deleted) {
        await putStripeCustomer(db, user.id, live, legacy);
        return legacy;
      }
    } catch (e) {
      if (!isMissing(e)) throw e; // anything but "no such customer" is not a verdict
      await putStripeCustomer(db, user.id, (1 - live) as 0 | 1, legacy); // the other mode's customer: kept there
    }
  }
  if (!create) return null;
  const c = await stripe.createCustomer(user.id, live === 1);
  await putStripeCustomer(db, user.id, live, c.id);
  return c.id;
}

/** A customer that is filed for this mode but Stripe does not know: needs a person, so nothing is created or sent. */
const isMissing = (e: unknown): boolean => e instanceof StripeError && e.code === 'resource_missing'; // (Stripe answers 400 or 404 with this code)

const site = (env: Env) => (env.SITE_URL ?? '').replace(/\/+$/, '');

/** price id -> checked at (ms): a price is re-read from Stripe at most every 5 minutes per Worker instance. */
const priceChecked = new Map<string, number>();
const PRICE_TTL_MS = 5 * 60_000;
/** Tests only: forget which prices were already checked. */
export const resetPriceCheckForTests = (): void => priceChecked.clear();
const BLOCKING = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);

/**
 * Limits on the billing endpoints (per ACCOUNT, stored in D1 table rate_limits; Google sign-in has its own counter per address):
 *  - BURST: 8 requests per minute for checkout + portal together. Every request counts, so hammering the buttons is stopped at once.
 *  - HOURLY: 20 payment pages (checkout) and 20 portal pages per hour, counted only when one is really about to be created, and given
 *    back if Stripe fails. A setup problem, "already subscribed", or a Stripe error therefore never locks a visitor out for an hour.
 * (Until this change a single counter of 10 per hour was shared by both, and used up by every click, failed or not.)
 */
const BURST = { limit: 8, windowSec: 60 };
const HOURLY = { limit: 20, windowSec: 3600 };
const burstKey = (userId: string) => `billing-burst:${userId}`;

export async function createCheckout(env: Env, user: UserRow, fetchFn?: FetchFn): Promise<Response> {
  if (!(await allow(env.DB!, burstKey(user.id), BURST.limit, BURST.windowSec))) return err(429, 'rate_limited');
  const mode = stripeLivemode(env);
  const existing = await getSubscription(env.DB!, user.id, mode);
  if (isOpenSubscription(existing, nowSec())) return err(409, 'already_subscribed'); // one contract per account (in this Stripe mode)
  const stripe = stripeClient(env.STRIPE_SECRET_KEY!, fetchFn);

  // the price must be exactly ¥200/month in the same mode (test/live) as the key, or nothing is created
  const cacheKey = `${env.STRIPE_SECRET_KEY!.slice(0, 8)}|${env.STRIPE_PRICE_ID}`;
  if (!priceChecked.has(cacheKey) || Date.now() - priceChecked.get(cacheKey)! > PRICE_TTL_MS) {
    const problem = priceProblem(await stripe.getPrice(env.STRIPE_PRICE_ID!), env.STRIPE_SECRET_KEY!);
    if (problem) {
      console.error(`checkout refused: ${problem} (STRIPE_PRICE_ID does not match what is sold, or the key is of the other mode)`);
      return err(503, problem);
    }
    priceChecked.set(cacheKey, Date.now());
  }

  const customer = (await customerFor(env, stripe, user, true))!;

  // Stripe is the truth: an unpaid/just-paid contract the webhook has not delivered yet still blocks a second one
  let listed: Awaited<ReturnType<StripeClient['listSubscriptions']>>;
  try {
    listed = await stripe.listSubscriptions(customer);
  } catch (e) {
    if (!isMissing(e)) throw e;
    logError('checkout refused: the customer filed for this account is unknown to Stripe in this mode', e); // not replaced silently
    return err(503, 'customer_unavailable');
  }
  const held = listed.data.find((s) => BLOCKING.has(s.status));
  if (held) {
    await syncSubscription(env, held, user.id).catch(() => false); // bring D1 up to date meanwhile
    return err(409, held.status === 'incomplete' ? 'payment_pending' : 'already_subscribed');
  }

  // from here a payment page really is created: this is what the hourly allowance counts
  const hourlyKey = `checkout:${user.id}`;
  if (!(await allow(env.DB!, hourlyKey, HOURLY.limit, HOURLY.windowSec))) return err(429, 'rate_limited');
  try {
    // only one payment page may be open at a time (two tabs paying twice would mean two subscriptions)
    for (const open of (await stripe.listOpenSessions(customer)).data) await stripe.expireSession(open.id).catch(() => undefined);

    const session = await stripe.createCheckout({
      customer,
      userId: user.id,
      price: env.STRIPE_PRICE_ID!,
      successUrl: `${site(env)}/art-slide/premium?checkout=success`,
      cancelUrl: `${site(env)}/art-slide/premium?checkout=cancel`,
    });
    return json({ url: session.url });
  } catch (e) {
    await giveBack(env.DB!, hourlyKey).catch(() => undefined); // Stripe failed: nothing was created, so nothing is used up
    throw e;
  }
}

export async function createPortal(env: Env, user: UserRow, fetchFn?: FetchFn): Promise<Response> {
  if (!(await allow(env.DB!, burstKey(user.id), BURST.limit, BURST.windowSec))) return err(429, 'rate_limited');
  const stripe = stripeClient(env.STRIPE_SECRET_KEY!, fetchFn);
  // the customer of THIS Stripe mode (a test-mode id is never sent with the live key)
  const customer = await customerFor(env, stripe, user, false);
  if (!customer) return err(404, 'no_customer');
  const hourlyKey = `portal:${user.id}`;
  if (!(await allow(env.DB!, hourlyKey, HOURLY.limit, HOURLY.windowSec))) return err(429, 'rate_limited');
  try {
    const portal = await stripe.createPortal(customer, `${site(env)}/art-slide/account`);
    return json({ url: portal.url });
  } catch (e) {
    await giveBack(env.DB!, hourlyKey).catch(() => undefined);
    if (isMissing(e)) {
      logError('portal refused: the customer filed for this account is unknown to Stripe in this mode', e);
      return err(503, 'customer_unavailable');
    }
    throw e;
  }
}

/** Account deletion: ends any open subscription, removes our rows. Stripe keeps the payment records it must keep. */
export async function deleteAccount(env: Env, user: UserRow, fetchFn?: FetchFn): Promise<Response> {
  const sub = await getSubscription(env.DB!, user.id, stripeLivemode(env));
  if (sub && billingConfigured(env) && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(sub.status)) {
    try {
      await stripeClient(env.STRIPE_SECRET_KEY!, fetchFn).cancelSubscription(sub.stripe_subscription_id);
    } catch (e) {
      if (!isMissing(e) && !(e instanceof StripeError && e.status === 404)) return err(502, 'cancel_failed'); // never delete while a charge could continue
    }
  }
  await deleteUser(env.DB!, user.id);
  return json({ deleted: true });
}

interface StripeEvent { id: string; type: string; livemode?: boolean; data: { object: Record<string, any> } } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Which subscription an event is about (the field moved between Stripe API versions for invoices). */
function subscriptionIdOf(ev: StripeEvent): string | null {
  const o = ev.data.object;
  if (ev.type.startsWith('customer.subscription.')) return typeof o.id === 'string' ? o.id : null;
  const s = o.subscription ?? o.parent?.subscription_details?.subscription;
  return typeof s === 'string' ? s : (s?.id ?? null);
}
export const HANDLED_EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed', 'invoice.paid', 'invoice.payment_failed', 'invoice.payment_succeeded'];
const HANDLED = new Set(HANDLED_EVENTS);

export async function handleWebhook(request: Request, env: Env, fetchFn?: FetchFn): Promise<Response> {
  const raw = await request.text();
  if (!(await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET!, nowSec()))) return err(400, 'bad_signature');
  let ev: StripeEvent;
  try {
    ev = JSON.parse(raw) as StripeEvent;
  } catch {
    return err(400, 'bad_payload');
  }
  if (!ev.id || !ev.type) return err(400, 'bad_payload');
  if (await eventSeen(env.DB!, ev.id)) return json({ received: true, duplicate: true });
  if (typeof ev.livemode === 'boolean' && ev.livemode !== (stripeLivemode(env) === 1)) {
    // an event of the OTHER Stripe mode (e.g. a test-mode endpoint pointing here): acknowledged, never applied
    await markEvent(env.DB!, ev.id, ev.type);
    return json({ received: true, ignored: 'other_mode' });
  }
  if (HANDLED.has(ev.type)) {
    try {
      const stripe = stripeClient(env.STRIPE_SECRET_KEY!, fetchFn);
      const subId = subscriptionIdOf(ev);
      if (subId) {
        // always take Stripe's current state, so a late or out-of-order event cannot write an old status
        let sub: StripeSubscription;
        try {
          sub = await stripe.getSubscription(subId);
        } catch (e) {
          if ((isMissing(e) || (e instanceof StripeError && e.status === 404)) && ev.type.startsWith('customer.subscription.')) sub = ev.data.object as unknown as StripeSubscription;
          else throw e;
        }
        const hint = ev.type === 'checkout.session.completed' ? (ev.data.object.client_reference_id as string | undefined) : undefined;
        if (ev.type === 'checkout.session.completed' && hint && ev.data.object.customer) {
          const u = await userById(env.DB!, hint);
          if (u && !(await getStripeCustomer(env.DB!, u.id, stripeLivemode(env)))) await putStripeCustomer(env.DB!, u.id, stripeLivemode(env), customerId(ev.data.object.customer));
        }
        await syncSubscription(env, sub, hint);
      }
    } catch (e) {
      logError(`webhook failed (${/^[a-z0-9._]{1,80}$/.test(ev.type) ? ev.type : 'unknown event type'})`, e);
      return err(500, 'processing_failed'); // not recorded: Stripe will deliver it again
    }
  }
  await markEvent(env.DB!, ev.id, ev.type);
  return json({ received: true });
}
