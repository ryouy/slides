import { describe, expect, it } from 'vitest';
import { checkNoOpenSubscriptions } from './check-no-open-subscriptions';

const KEY = { STRIPE_SECRET_KEY: 'rk_live_abcdefghijklmnop' };
const run = async (subs: object[], status = 200, env: Record<string, string> = KEY) => {
  const lines: string[] = [];
  const calls: { url: string; method?: string }[] = [];
  const ok = await checkNoOpenSubscriptions(env, async (url, init) => { calls.push({ url, method: init?.method }); return new Response(JSON.stringify({ data: subs, has_more: false }), { status }); }, (s) => lines.push(s));
  return { ok, out: lines.join('\n'), calls };
};
const sub = (over: object) => ({ id: 'sub_1ABCDEFGHIJKL', status: 'active', cancel_at_period_end: false, current_period_end: 1800000000, ...over });

describe('check-no-open-subscriptions', () => {
  it('passes with no subscriptions, or only canceled / incomplete_expired ones', async () => {
    expect((await run([])).ok).toBe(true);
    expect((await run([sub({ status: 'canceled' }), sub({ id: 'sub_2', status: 'incomplete_expired' })])).ok).toBe(true);
  });
  it('fails for an active, trialing, past_due, unpaid, incomplete or paused subscription', async () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) expect((await run([sub({ status })])).ok, status).toBe(false);
  });
  it('an active subscription that is set to end does not bill again (passes) and is labelled as ending', async () => {
    const r = await run([sub({ cancel_at_period_end: true })]);
    expect(r.ok).toBe(true);
    expect(r.out).toContain('set to end');
    expect((await run([sub({ cancel_at: 1800000000 })])).ok).toBe(true);
  });
  it('reads only (GET), never prints the key or a full subscription id, and fails if Stripe cannot be read', async () => {
    const r = await run([sub({})]);
    expect(r.calls.every((c) => (c.method ?? 'GET') === 'GET')).toBe(true);
    expect(r.out).not.toContain('abcdefghijklmnop');
    expect(r.out).not.toContain('sub_1ABCDEFGHIJKL');
    expect((await run([], 403)).ok).toBe(false);
    expect((await run([], 200, {})).ok).toBe(false);
    expect((await run([], 200, { STRIPE_SECRET_KEY: 'pk_live_abcdefghijkl' })).ok).toBe(false);
  });
});
