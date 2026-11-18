import { describe, expect, it } from 'vitest';
import { checkStripePermissions, EXTRAS, EXTRA_WRITES, NEEDED } from './check-stripe-permissions';

const KEY = 'rk_live_abcdefghijklmnop';
/** A key that has exactly `granted` permission labels; the answer depends on which probe was sent. */
async function run(granted: (label: string) => boolean, env: Record<string, string> = {}) {
  const all = [...NEEDED.map((n) => ({ label: n.permission, ...n.probe })), ...EXTRAS.map((e) => ({ label: e.permission, ...e.probe })), ...EXTRA_WRITES.map((e) => ({ label: e.permission, ...e.probe }))];
  const lines: string[] = [];
  const sent: { method: string; url: string; body?: unknown }[] = [];
  const ok = await checkStripePermissions({ STRIPE_SECRET_KEY: KEY, ...env }, async (url, init) => {
    const method = init?.method ?? 'GET';
    sent.push({ method, url, body: init?.body });
    const path = url.replace('https://api.stripe.com/v1', '');
    const hit = all.find((a) => a.method === method && a.path === path);
    if (!hit) return new Response('{}', { status: 500 });
    if (!granted(hit.label)) return new Response('{"error":{"type":"invalid_request_error","message":"The provided key does not have the required permissions"}}', { status: 403 });
    return new Response(method === 'GET' ? '{"data":[]}' : '{"error":{"message":"No such object"}}', { status: method === 'GET' ? 200 : 404 });
  }, (s) => lines.push(s));
  return { ok, out: lines.join('\n'), sent };
}

describe('check-stripe-permissions', () => {
  it('the Worker needs these seven permissions for its nine requests', () => {
    expect(NEEDED.map((n) => n.permission)).toEqual(['Prices — Read', 'Customers — Write', 'Subscriptions — Read', 'Subscriptions — Write', 'Checkout Sessions — Read', 'Checkout Sessions — Write', 'Customer portal — Write']);
  });
  it('default run sends only GET requests, never prints the key, and says writes were not probed', async () => {
    const r = await run(() => true);
    expect(r.sent.every((s) => s.method === 'GET')).toBe(true);
    expect(r.out).not.toContain('abcdefghijklmnop');
    expect(r.out).toContain('not probed');
    expect(r.ok).toBe(true);
  });
  it('a key with exactly the needed permissions passes and reports no extras', async () => {
    const needed = new Set(NEEDED.map((n) => n.permission));
    const r = await run((l) => needed.has(l), { PROBE_WRITES: '1' });
    expect(r.ok).toBe(true);
    expect(r.out).toContain('none of the probed extras');
    expect(r.out).toContain('every permission checked that the Worker needs is present');
  });
  it('reports a missing needed permission and fails', async () => {
    const needed = new Set(NEEDED.map((n) => n.permission));
    needed.delete('Customer portal — Write');
    const r = await run((l) => needed.has(l), { PROBE_WRITES: '1' });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('Customer portal — Write is MISSING');
  });
  it('lists the permissions the key has beyond what is needed (reads by default, writes with PROBE_WRITES=1) without failing', async () => {
    const r = await run(() => true);
    expect(r.out).toContain('! Charges — Read');
    expect(r.out).not.toContain('Refunds — Write');
    const w = await run(() => true, { PROBE_WRITES: '1' });
    expect(w.out).toContain('! Refunds — Write');
    expect(w.out).toContain('! Payouts — Write');
    expect(w.ok).toBe(true);
  });
  it('every write probe is built so that it cannot succeed: a nonexistent id, or no required parameter', () => {
    for (const p of [...NEEDED.map((n) => n.probe), ...EXTRA_WRITES.map((e) => e.probe)].filter((x) => x.method !== 'GET')) {
      const nonexistent = /zzprobe_nonexistent/.test(p.path) || /zzprobe_nonexistent/.test(p.body ?? '');
      const noRequiredParams = p.method === 'POST' && (p.body ?? '') === ''; // creating endpoints sent with no parameters at all
      expect(nonexistent || noRequiredParams, `${p.method} ${p.path}`).toBe(true);
    }
  });
  it('a bad key stops at once', async () => {
    expect((await run(() => true, { STRIPE_SECRET_KEY: 'pk_live_abcdefghijkl' })).ok).toBe(false);
  });
});
