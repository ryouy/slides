import { describe, expect, it } from 'vitest';
import { checkStripe } from './check-stripe';

const price = { id: 'price_1Abc23DEF', active: true, livemode: false, currency: 'jpy', unit_amount: 200, type: 'recurring', recurring: { interval: 'month', interval_count: 1 } };
const run = async (env: Record<string, string>, body: unknown = price, status = 200) => {
  const lines: string[] = [];
  const ok = await checkStripe(env, async () => new Response(JSON.stringify(body), { status }), (s) => lines.push(s));
  return { ok, out: lines.join('\n') };
};
const good = { STRIPE_SECRET_KEY: 'sk_test_abcdefghijklmn', STRIPE_PRICE_ID: 'price_1Abc23DEF' };

describe('check-stripe', () => {
  it('passes for a test key with the matching ¥200/month price, and never prints the key', async () => {
    const r = await run(good);
    expect(r.ok).toBe(true);
    expect(r.out).toContain('no real money can move');
    expect(r.out).not.toContain('abcdefghijklmn');
  });
  it('fails on a product id, a publishable key, a missing price, the wrong amount/interval and a mode mismatch', async () => {
    expect((await run({ ...good, STRIPE_PRICE_ID: 'prod_ABC123xyz' })).ok).toBe(false);
    expect((await run({ ...good, STRIPE_SECRET_KEY: 'pk_test_abcdefghijklmn' })).ok).toBe(false);
    expect((await run(good, {}, 404)).out).toContain('does not exist for this key');
    expect((await run(good, { ...price, unit_amount: 500 })).ok).toBe(false);
    expect((await run(good, { ...price, recurring: { interval: 'year', interval_count: 1 } })).ok).toBe(false);
    expect((await run(good, { ...price, livemode: true })).out).toContain('price_mode_mismatch');
    expect((await run(good, {}, 401)).out).toContain('refused the key');
  });
  it('warns that a live key is real money and needs the second switch', async () => {
    const r = await run({ STRIPE_SECRET_KEY: 'sk_live_abcdefghijklmn', STRIPE_PRICE_ID: 'price_1Abc23DEF' }, { ...price, livemode: true });
    expect(r.ok).toBe(true);
    expect(r.out).toContain('real cards will be charged');
    expect(r.out).toContain('ALLOW_LIVE_PAYMENTS');
  });
});
