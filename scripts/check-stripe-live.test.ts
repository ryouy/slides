import { describe, expect, it } from 'vitest';
import { HANDLED_EVENTS } from '../worker/billing';
import { checkStripeLive } from './check-stripe-live';

const KEY = 'rk_live_abcdefghijklmnop';
const price = { id: 'price_1Abc23DEF', active: true, livemode: true, currency: 'jpy', unit_amount: 200, type: 'recurring', recurring: { interval: 'month', interval_count: 1 } };
const endpoint = (over: object = {}) => ({ url: 'https://slides.ryouy.workers.dev/api/stripe/webhook', status: 'enabled', livemode: true, enabled_events: [...HANDLED_EVENTS], ...over });
const portal = (over: object = {}) => ({ id: 'bpc_1', active: true, is_default: true, livemode: true, features: { subscription_cancel: { enabled: true, mode: 'at_period_end' } }, ...over });

async function run(o: { price?: object; endpoints?: object[]; portals?: object[]; deny?: string[]; env?: Record<string, string> } = {}) {
  const lines: string[] = [];
  const calls: { url: string; method?: string }[] = [];
  const ok = await checkStripeLive({ STRIPE_SECRET_KEY: KEY, STRIPE_PRICE_ID: 'price_1Abc23DEF', ...o.env }, async (url, init) => {
    calls.push({ url, method: init?.method });
    const path = url.replace('https://api.stripe.com/v1', '');
    if (o.deny?.some((d) => path.startsWith(d))) return new Response('{}', { status: 403 });
    const j = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (path.startsWith('/prices/')) return j(o.price ?? price);
    if (path.startsWith('/webhook_endpoints')) return j({ data: o.endpoints ?? [endpoint()] });
    if (path.startsWith('/billing_portal/configurations')) return j({ data: o.portals ?? [portal()] });
    return j({ data: [] });
  }, (s) => lines.push(s));
  return { ok, out: lines.join('\n'), calls };
}

describe('check-stripe-live (read-only)', () => {
  it('passes when the key can read, the price, the endpoint and the portal are right — and sends only GETs', async () => {
    const r = await run();
    expect(r.ok).toBe(true);
    expect(r.calls.every((c) => (c.method ?? 'GET') === 'GET')).toBe(true);
    expect(r.out).not.toContain('abcdefghijklmnop');
    expect(r.out).toContain('WRITE permissions');
  });
  it('fails for a wrong price (amount, mode, inactive)', async () => {
    expect((await run({ price: { ...price, unit_amount: 500 } })).ok).toBe(false);
    expect((await run({ price: { ...price, livemode: false } })).ok).toBe(false);
    expect((await run({ price: { ...price, active: false } })).ok).toBe(false);
  });
  it('fails when the endpoint is missing, disabled, in the other mode, or lacks an event; passes for “all events”', async () => {
    expect((await run({ endpoints: [] })).ok).toBe(false);
    expect((await run({ endpoints: [endpoint({ status: 'disabled' })] })).ok).toBe(false);
    expect((await run({ endpoints: [endpoint({ livemode: false })] })).ok).toBe(false);
    const missing = await run({ endpoints: [endpoint({ enabled_events: HANDLED_EVENTS.filter((e) => e !== 'customer.subscription.deleted') })] });
    expect(missing.ok).toBe(false);
    expect(missing.out).toContain('customer.subscription.deleted');
    // the three optional ones may be absent: only a warning
    const opt = await run({ endpoints: [endpoint({ enabled_events: HANDLED_EVENTS.filter((e) => !['customer.subscription.paused', 'customer.subscription.resumed', 'invoice.payment_succeeded'].includes(e)) })] });
    expect(opt.ok).toBe(true);
    expect(opt.out).toContain('optional events not subscribed');
    expect((await run({ endpoints: [endpoint({ url: 'https://other.example/api/stripe/webhook' })] })).ok).toBe(false);
    expect((await run({ endpoints: [endpoint({ enabled_events: ['*'] })] })).ok).toBe(true);
  });
  it('fails when the portal cannot cancel, or cancels immediately, or there is none', async () => {
    expect((await run({ portals: [] })).ok).toBe(false);
    expect((await run({ portals: [portal({ features: { subscription_cancel: { enabled: false } } })] })).ok).toBe(false);
    expect((await run({ portals: [portal({ features: { subscription_cancel: { enabled: true, mode: 'immediately' } } })] })).ok).toBe(false);
  });
  it('fails (and says what to grant) when a read permission is missing; fails for a bad key', async () => {
    const r = await run({ deny: ['/subscriptions'] });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('cannot read subscriptions');
    expect((await run({ deny: ['/webhook_endpoints'] })).ok).toBe(false);
    expect((await run({ env: { STRIPE_SECRET_KEY: 'pk_live_abcdefghijkl' } })).ok).toBe(false);
  });
});
