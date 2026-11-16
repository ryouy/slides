import type { Env } from './env';
import { billingConfigured } from './env';
import { allow, deleteUser, eventSeen, getSubscription, markEvent, nowSec, saveSubscription, setStripeCustomer, userByCustomer, userById, type UserRow } from './db';
import { hasPremium, isOpenSubscription, type SubscriptionRow } from './entitlement';
import { err, json } from './http';
import { priceProblem } from './priceCheck';
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
  const cust = customerId(sub.customer);
  let user: UserRow | null = null;
  const metaId = sub.metadata?.user_id ?? hintUserId;
  if (metaId) user = await userById(db, metaId);
  if (!user) user = await userByCustomer(db, cust);
  if (!user) return false; // not ours (e.g. a test event for another product)
  // a customer is tied to one account for good: a subscription of a different customer never lands on this account
  if (user.stripe_customer_id && user.stripe_customer_id !== cust) return false;
  if (!user.stripe_customer_id) await setStripeCustomer(db, user.id, cust);
  const saved = await saveSubscription(
    db,
    user.id,
    { stripe_subscription_id: sub.id, status: sub.status, current_period_end: periodEnd(sub), cancel_at_period_end: !!sub.cancel_at_period_end || typeof sub.cancel_at === 'number' },
    (r: SubscriptionRow) => hasPremium(r, nowSec()),
  );
  if (!saved) console.error(`duplicate_subscription: ${sub.id} ignored, the account already has an active one (cancel/refund it in Stripe)`);
  return true;
}

/** Re-reads the account's subscription from Stripe (used after Checkout and when a stored period has run out). */
async function refreshFromStripe(env: Env, stripe: StripeClient, user: UserRow): Promise<void> {
  if (!user.stripe_customer_id) return;
  const list = await stripe.listSubscriptions(user.stripe_customer_id);
  const best = list.data.find((s) => hasPremium({ status: s.status, current_period_end: periodEnd(s), cancel_at_period_end: s.cancel_at_period_end ? 1 : 0 }, nowSec())) ?? list.data[0];
  if (best) await syncSubscription(env, best, user.id);
}

export async function planFor(env: Env, user: UserRow, opts: { refresh?: boolean; fetchFn?: FetchFn } = {}): Promise<PlanInfo> {
  let sub = await getSubscription(env.DB!, user.id);
  const stale = !!sub && nowSec() >= (sub.current_period_end ?? 0) && nowSec() - sub.updated_at > REFRESH_AFTER && ['active', 'past_due', 'trialing'].includes(sub.status);
  if ((opts.refresh || stale) && billingConfigured(env)) {
    try {
      await refreshFromStripe(env, stripeClient(env.STRIPE_SECRET_KEY!, opts.fetchFn), user);
      sub = await getSubscription(env.DB!, user.id);
    } catch (e) {
      console.error('stripe refresh failed', e instanceof StripeError ? e.status : e);
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

async function ensureCustomer(env: Env, stripe: StripeClient, user: UserRow): Promise<string> {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const c = await stripe.createCustomer(user.id);
  await setStripeCustomer(env.DB!, user.id, c.id);
  return c.id;
}

const site = (env: Env) => (env.SITE_URL ?? '').replace(/\/+$/, '');

/** price id -> checked at (ms): a price is re-read from Stripe at most every 5 minutes per Worker instance. */
const priceChecked = new Map<string, number>();
const PRICE_TTL_MS = 5 * 60_000;
const BLOCKING = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);

export async function createCheckout(env: Env, user: UserRow, fetchFn?: FetchFn): Promise<Response> {
  if (!(await allow(env.DB!, `billing:${user.id}`, 10, 3600))) return err(429, 'rate_limited');
  const existing = await getSubscription(env.DB!, user.id);
  if (isOpenSubscription(existing, nowSec())) return err(409, 'already_subscribed'); // one contract per account
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

  const customer = await ensureCustomer(env, stripe, user);

  // Stripe is the truth: an unpaid/just-paid contract the webhook has not delivered yet still blocks a second one
  const live = await stripe.listSubscriptions(customer);
  const held = live.data.find((s) => BLOCKING.has(s.status));
  if (held) {
    await syncSubscription(env, held, user.id).catch(() => false); // bring D1 up to date meanwhile
    return err(409, held.status === 'incomplete' ? 'payment_pending' : 'already_subscribed');
  }

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
}

export async function createPortal(env: Env, user: UserRow, fetchFn?: FetchFn): Promise<Response> {
  if (!user.stripe_customer_id) return err(404, 'no_customer');
  if (!(await allow(env.DB!, `billing:${user.id}`, 10, 3600))) return err(429, 'rate_limited');
  const portal = await stripeClient(env.STRIPE_SECRET_KEY!, fetchFn).createPortal(user.stripe_customer_id, `${site(env)}/art-slide/account`);
  return json({ url: portal.url });
}

/** Account deletion: ends any open subscription, removes our rows. Stripe keeps the payment records it must keep. */
export async function deleteAccount(env: Env, user: UserRow, fetchFn?: FetchFn): Promise<Response> {
  const sub = await getSubscription(env.DB!, user.id);
  if (sub && billingConfigured(env) && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(sub.status)) {
    try {
      await stripeClient(env.STRIPE_SECRET_KEY!, fetchFn).cancelSubscription(sub.stripe_subscription_id);
    } catch (e) {
      if (!(e instanceof StripeError && e.status === 404)) return err(502, 'cancel_failed'); // never delete while a charge could continue
    }
  }
  await deleteUser(env.DB!, user.id);
  return json({ deleted: true });
}

interface StripeEvent { id: string; type: string; data: { object: Record<string, any> } } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Which subscription an event is about (the field moved between Stripe API versions for invoices). */
function subscriptionIdOf(ev: StripeEvent): string | null {
  const o = ev.data.object;
  if (ev.type.startsWith('customer.subscription.')) return typeof o.id === 'string' ? o.id : null;
  const s = o.subscription ?? o.parent?.subscription_details?.subscription;
  return typeof s === 'string' ? s : (s?.id ?? null);
}
const HANDLED = new Set(['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed', 'invoice.paid', 'invoice.payment_failed', 'invoice.payment_succeeded']);

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
          if (e instanceof StripeError && e.status === 404 && ev.type.startsWith('customer.subscription.')) sub = ev.data.object as unknown as StripeSubscription;
          else throw e;
        }
        const hint = ev.type === 'checkout.session.completed' ? (ev.data.object.client_reference_id as string | undefined) : undefined;
        if (ev.type === 'checkout.session.completed' && hint && ev.data.object.customer) {
          const u = await userById(env.DB!, hint);
          if (u && !u.stripe_customer_id) await setStripeCustomer(env.DB!, u.id, customerId(ev.data.object.customer));
        }
        await syncSubscription(env, sub, hint);
      }
    } catch (e) {
      console.error('webhook failed', ev.type, e instanceof StripeError ? e.status : e);
      return err(500, 'processing_failed'); // not recorded: Stripe will deliver it again
    }
  }
  await markEvent(env.DB!, ev.id, ev.type);
  return json({ received: true });
}
