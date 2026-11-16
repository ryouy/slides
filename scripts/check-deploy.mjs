#!/usr/bin/env node
/**
 * Post-deploy check for the account/billing API. Read-only apart from harmless rejected requests:
 * it never signs in, never creates a customer and never starts a purchase.
 *
 *   node scripts/check-deploy.mjs https://slides.ryouy.workers.dev --stage 0
 *   node scripts/check-deploy.mjs https://slides.ryouy.workers.dev --stage 1
 *   node scripts/check-deploy.mjs http://localhost:8787 --stage 1
 *
 * Stage 0: right after the first deploy (no D1 tables / secrets yet): the site works, every API says "not configured".
 * Stage 1: D1 tables created and all Secrets set, PURCHASES_ENABLED still "false": sign-in works, nothing can be bought.
 * Stage 2: same as stage 1 but PURCHASES_ENABLED="true" (only for the final go-live check).
 *
 * Exit code 0 = every check passed, 1 = something failed (details are printed).
 */
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? '').replace(/\/+$/, '');
const stageArg = args.indexOf('--stage');
const stage = stageArg >= 0 ? Number(args[stageArg + 1]) : NaN;
if (!base || ![0, 1, 2].includes(stage)) {
  console.error('usage: node scripts/check-deploy.mjs <base-url> --stage <0|1|2>');
  process.exit(2);
}

let failed = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) failed++;
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${!pass && detail ? `\n      ${detail}` : ''}`);
};
const get = (path, init) => fetch(base + path, { redirect: 'manual', ...init });
const origin = new URL(base).origin;

console.log(`\nChecking ${base} (stage ${stage})\n`);

console.log('The site itself (must never change):');
for (const p of ['/', '/art-slide', '/art-slide/gallery', '/art-slide/play/van-gogh-bedroom', '/word-slide/daily', '/big-slide', '/commerce', '/privacy', '/terms']) {
  const r = await get(p);
  ok(`${p} → 200 HTML`, r.status === 200 && (r.headers.get('content-type') ?? '').includes('text/html'), `got ${r.status} ${r.headers.get('content-type')}`);
}
{
  const html = await (await get('/')).text();
  ok('the page is the ART SLIDE app', /ART SLIDE/.test(html) && /<script[^>]+src=/.test(html));
  const src = (html.match(/<script[^>]+src="([^"]+)"/) ?? [])[1];
  if (src) {
    const js = await (await get(src)).text();
    const leak = js.match(/sk_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|GOCSPX-[A-Za-z0-9_-]{8,}|rk_(live|test)_[A-Za-z0-9]{8,}/);
    ok('no secret-looking value in the site JavaScript', !leak, leak ? `found ${leak[0].slice(0, 12)}…` : '');
  }
  const ads = await get('/ads/desktop.html');
  ok('ad frame page is served (unchanged feature)', ads.status === 200 || ads.status === 307 || ads.status === 308, `got ${ads.status}`);
}

console.log('\nAPI:');
const cfgRes = await get('/api/config');
const cfg = await cfgRes.json().catch(() => null);
ok('/api/config answers JSON', cfgRes.status === 200 && cfg && typeof cfg.auth === 'boolean', `got ${cfgRes.status}`);
ok('/api/config sends no CORS header (other sites cannot read it)', !cfgRes.headers.get('access-control-allow-origin'));
ok('/api/config is not cacheable', /no-store/.test(cfgRes.headers.get('cache-control') ?? ''));

const wantAuth = stage >= 1;
ok(`/api/config auth = ${wantAuth}`, cfg?.auth === wantAuth, `got ${JSON.stringify(cfg)}`);
ok(`/api/config billing = ${wantAuth}`, cfg?.billing === wantAuth, `got ${JSON.stringify(cfg)}`);
ok(`/api/config purchases = ${stage === 2}`, cfg?.purchases === (stage === 2), `got ${JSON.stringify(cfg)}   ← must be false until go-live`);
if (wantAuth) ok('/api/config includes the PUBLIC Google client id (ends .apps.googleusercontent.com)', /\.apps\.googleusercontent\.com$/.test(cfg?.googleClientId ?? ''), `got ${cfg?.googleClientId}`);
else ok('/api/config exposes no client id while unconfigured', !cfg?.googleClientId);
ok('/api/config exposes nothing else', Object.keys(cfg ?? {}).every((k) => ['auth', 'billing', 'purchases', 'googleClientId'].includes(k)), `keys: ${Object.keys(cfg ?? {})}`);

const nf = await get('/api/does-not-exist');
ok('unknown /api path → 404 JSON', nf.status === 404);

if (!wantAuth) {
  const me = await get('/api/me');
  ok('/api/me → 503 not_configured', me.status === 503, `got ${me.status}`);
  const login = await get('/api/auth/google');
  ok('/api/auth/google → 503 (no redirect to Google)', login.status === 503, `got ${login.status}`);
  const wh = await get('/api/stripe/webhook', { method: 'POST', body: '{}' });
  ok('/api/stripe/webhook → 503', wh.status === 503, `got ${wh.status}`);
} else {
  const me = await get('/api/me');
  const meBody = await me.json().catch(() => null);
  ok('/api/me (not signed in) → 200 {"signedIn":false}', me.status === 200 && meBody?.signedIn === false && meBody?.premium === false, `got ${me.status} ${JSON.stringify(meBody)}`);

  const login = await get('/api/auth/google?return=/art-slide/account');
  const loc = login.headers.get('location') ?? '';
  let u;
  try { u = new URL(loc); } catch { /* not a URL */ }
  ok('/api/auth/google → redirect to accounts.google.com', login.status === 302 && u?.origin === 'https://accounts.google.com', `got ${login.status} ${loc.slice(0, 80)}   ← 500 here means the D1 tables are missing (run migrations/0001_init.sql); 503 means a Secret is missing`);
  ok('  uses PKCE S256 + state + nonce', u?.searchParams.get('code_challenge_method') === 'S256' && !!u?.searchParams.get('code_challenge') && !!u?.searchParams.get('state') && !!u?.searchParams.get('nonce'));
  ok('  scope is only "openid profile" (no Drive at sign-in)', u?.searchParams.get('scope') === 'openid profile', `got ${u?.searchParams.get('scope')}`);
  ok(`  redirect_uri is exactly ${origin}/api/auth/callback`, u?.searchParams.get('redirect_uri') === `${origin}/api/auth/callback`, `got ${u?.searchParams.get('redirect_uri')}   ← must match Google Cloud exactly`);
  ok('  client_id matches /api/config', u?.searchParams.get('client_id') === cfg?.googleClientId);
  const cookie = (login.headers.getSetCookie?.() ?? []).join('\n');
  ok('  state cookie is HttpOnly + SameSite=Lax' + (base.startsWith('https') ? ' + Secure' : ''), /HttpOnly/.test(cookie) && /SameSite=Lax/.test(cookie) && (!base.startsWith('https') || /Secure/.test(cookie)));

  const bad = await get('/api/auth/callback?code=x&state=wrong');
  ok('callback with a wrong state is refused (redirects to /?auth=invalid)', bad.status === 302 && /auth=invalid/.test(bad.headers.get('location') ?? ''), `got ${bad.status} ${bad.headers.get('location')}`);
  const err = await get('/api/auth/callback?error=access_denied');
  ok('callback with a denied consent → /?auth=denied', err.status === 302 && /auth=denied/.test(err.headers.get('location') ?? ''));

  const post = (path, headers = {}) => get(path, { method: 'POST', headers });
  const noLogin = await post('/api/billing/checkout', { origin });
  ok(`checkout without sign-in → ${stage === 2 ? 401 : '401 or 503'}`, noLogin.status === 401 || (stage < 2 && noLogin.status === 503), `got ${noLogin.status}`);
  const evil = await post('/api/billing/checkout', { origin: 'https://evil.example' });
  ok('checkout from another site → 403', evil.status === 403, `got ${evil.status}`);
  const noOrigin = await post('/api/auth/logout');
  ok('logout without an Origin header → 403 (CSRF guard)', noOrigin.status === 403, `got ${noOrigin.status}`);
  const get405 = await get('/api/billing/checkout');
  ok('checkout via GET → not allowed', get405.status === 405 || get405.status === 401, `got ${get405.status}`);

  const wh = await get('/api/stripe/webhook', { method: 'POST', body: '{"id":"evt_check","type":"x"}' });
  ok('webhook without a Stripe signature → 400', wh.status === 400, `got ${wh.status}`);
  const wh2 = await get('/api/stripe/webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=00' } });
  ok('webhook with a wrong signature → 400', wh2.status === 400, `got ${wh2.status}`);
  const whGet = await get('/api/stripe/webhook');
  ok('webhook via GET → 405', whGet.status === 405, `got ${whGet.status}`);
}

console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nAll checks passed\n');
process.exit(failed ? 1 : 0);
