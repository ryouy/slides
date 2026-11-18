#!/usr/bin/env node
/**
 * Read-only check of the public site around the Premium launch. It never buys, signs in or changes anything.
 *
 *   node scripts/check-launch.mjs [https://slides.ryouy.workers.dev] --expect stopped   (sales off: the state before launch / after a stop)
 *   node scripts/check-launch.mjs [https://slides.ryouy.workers.dev] --expect live      (sales open: after the launch steps)
 *
 * Exit code 0 = everything matches the expected state.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const B = (args.find((a) => a.startsWith('http')) ?? 'https://slides.ryouy.workers.dev').replace(/\/+$/, '');
const live = args.includes('--expect') ? args[args.indexOf('--expect') + 1] === 'live' : true;
let bad = 0;
const check = (ok, m, extra = '') => { console.log(`  ${ok ? '✓' : '✗'} ${m}${extra ? `  (${extra})` : ''}`); if (!ok) bad++; };
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; launch-check)' };
const get = (p, init = {}) => fetch(B + p, { ...init, headers: { ...UA, ...(init.headers ?? {}) }, redirect: 'manual' });
console.log(`\nExpecting: sales ${live ? 'OPEN (live)' : 'STOPPED'}   site: ${B}`);

console.log('\n1. Server state');
const cfg = await (await get('/api/config')).json();
check(cfg.auth === true && cfg.billing === true, '/api/config: auth and billing are on');
check(cfg.purchases === live, `/api/config: purchases is ${live}`, `purchases:${cfg.purchases}`);
const secretLike = /(rk|sk)_(live|test)_|whsec_|GOCSPX|SESSION_SECRET|STRIPE_SECRET/;
for (const [m, p, init, want] of [['GET', '/api/me', {}, 200], ['POST', '/api/billing/checkout', { method: 'POST', headers: { origin: B } }, 401], ['POST', '/api/billing/checkout', { method: 'POST', headers: { origin: 'https://evil.example' } }, 403], ['POST', '/api/billing/portal', { method: 'POST', headers: { origin: B } }, 401], ['POST', '/api/stripe/webhook', { method: 'POST', body: '{"id":"x","type":"y"}' }, 400]]) {
  const r = await get(p, init); const t = await r.text();
  check(r.status === want && !secretLike.test(t), `${m} ${p}${init.headers?.origin?.includes('evil') ? ' (other site)' : ''} → ${want}, no secrets`, `HTTP ${r.status}`);
}

console.log('\n2. Full-size paintings (Premium ones need a Premium account once enforced)');
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(B + '/art-slide/gallery', { waitUntil: 'networkidle' });
const locked = await page.locator('[data-testid^="lock-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').slice(5)));
const open = await page.locator('a.gcard').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').slice(4)));
if (live) check(locked.length > 0, 'gallery: Premium paintings carry a lock for a free visitor', `${locked.length} locked`);
else check(locked.length === 0, 'gallery: nothing is locked while sales are stopped');
const free = open.find((id) => !locked.includes(id));
if (free) { const r = await get(`/artworks/${free}.webp`); check(r.status === 200, `a free painting's image is served (${free})`, `HTTP ${r.status}`); }
if (locked.length) {
  const id = locked[Math.min(5, locked.length - 1)];
  const r = await get(`/artworks/${id}.webp`);
  check(r.status === (live ? 403 : 200), `a Premium painting's full-size image is ${live ? 'refused (403) without a Premium account' : 'served as before'}`, `HTTP ${r.status}`);
  const t = await get(`/artworks/${id}-thumb.webp`);
  check(t.status === 200, 'its thumbnail stays public (the gallery works)', `HTTP ${t.status}`);
}

console.log('\n3. Premium page (not signed in)');
await page.goto(B + '/art-slide/premium', { waitUntil: 'networkidle' });
const text = await page.getByTestId('premium').innerText();
check(/¥200/.test(text) && /税込/.test(text), 'price shown: 月額 ¥200（税込）');
if (live) {
  check((await page.getByTestId('premium-soon').count()) === 0, '"not available yet" is gone');
  check((await page.getByTestId('purchase-facts').count()) === 1, 'the facts before buying are shown (price, renewal, cancelling, refunds)');
  check((await page.getByTestId('premium-subscribe').count()) === 1 && (await page.getByTestId('premium-subscribe').isDisabled()), 'the subscribe button is there and needs consent first');
  await page.getByTestId('premium-agree').check();
  check(await page.getByTestId('premium-subscribe').isEnabled(), 'ticking the consent box enables it');
  check((await page.getByTestId('premium-signin').count()) === 1, 'the visitor is told to sign in with Google first');
  for (const [id, href] of [['premium-commerce-link', '/commerce']]) check((await page.getByTestId(id).getAttribute('href')) === href, 'link to the commercial-law notice');
} else {
  check((await page.getByTestId('premium-soon').count()) === 1 && (await page.getByTestId('premium-subscribe').count()) === 0, 'shows "not available yet" and no buy button');
}

console.log('\n4. The games');
for (const [p, sel] of [['/art-slide/play/van-gogh-bedroom', '.atile'], ['/art-slide/daily', '.atile'], ['/word-slide/daily', '.tile'], ['/big-slide/daily', 'button']]) {
  await page.goto(B + p, { waitUntil: 'networkidle' });
  check((await page.locator(sel).count()) > 4, `${p} loads`);
}
check(errs.length === 0, 'no page errors', `${errs.length}`);
await browser.close();
console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
