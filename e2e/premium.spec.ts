import { expect, test, type Page } from '@playwright/test';
import { OPERATOR } from '../src/legal/operator';

/** The Worker API is replaced by in-page mocks: these tests are about what the site does with its answers. */
type Me = { signedIn: boolean; premium: boolean; canPurchase?: boolean; name?: string; status?: string | null; currentPeriodEnd?: number | null; cancelAtPeriodEnd?: boolean };
async function mockApi(page: Page, opts: { config?: { auth: boolean; billing: boolean; purchases: boolean } | null; me?: Me; meDelayMs?: number; checkout?: { status: number; body?: unknown } | 'abort' } = {}) {
  const calls: string[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    calls.push(`${req.method()} ${path}${new URL(req.url()).search}`);
    const ok = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/config') return opts.config === null ? route.fulfill({ status: 503, body: '{}' }) : ok(opts.config ?? { auth: true, billing: true, purchases: true });
    if (path === '/api/me' || path === '/api/billing/status') {
      if (opts.meDelayMs) await new Promise((r) => setTimeout(r, opts.meDelayMs));
      return ok(opts.me ?? { signedIn: false, premium: false });
    }
    if (path === '/api/billing/checkout') {
      if (opts.checkout === 'abort') return route.abort('failed');
      if (opts.checkout) return route.fulfill({ status: opts.checkout.status, contentType: 'application/json', body: JSON.stringify(opts.checkout.body ?? {}) });
      return ok({ url: '/art-slide/premium?checkout=mock' });
    }
    if (path === '/api/billing/portal') return ok({ url: '/art-slide/account?portal=mock' });
    if (path === '/api/auth/logout' || path === '/api/account/delete') return ok({ ok: true, deleted: true });
    return route.fulfill({ status: 404, body: '{}' });
  });
  return calls;
}
const gating = (page: Page) => page.addInitScript(() => { localStorage.setItem('slides:dev-gating', '1'); localStorage.setItem('slides:dev-operator', '1'); });
const PREMIUM: Me = { signedIn: true, premium: true, name: 'Ann Example', status: 'active', currentPeriodEnd: Math.floor(Date.now() / 1000) + 20 * 86400, cancelAtPeriodEnd: false };
const LOCKED = 'monet-stacks-of-wheat-end-of-summer';

/** Opens the "before you subscribe" pull-down (harmless if it is already open). */
async function openSheet(page: import('@playwright/test').Page) {
  const d = page.getByTestId('purchase-details');
  await d.waitFor({ timeout: 8000 }).catch(() => {}); // not every visitor gets the purchase panel
  if (!(await d.count())) return;
  await page.waitForLoadState('networkidle'); // the account answer has arrived: the panel will not be rebuilt (and folded) any more
  // the panel can re-render while the account answer arrives (that closes the element again): retry until it stays open
  await expect(async () => {
    if (!(await d.evaluate((el) => (el as HTMLDetailsElement).open))) await d.locator('summary').click();
    await expect(d).toHaveJSProperty('open', true);
  }).toPass({ timeout: 20000 });
}

test('without the paid plan switched on, the site never calls the API', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto('/art-slide/gallery');
  await page.goto('/art-slide/play/' + LOCKED);
  await expect(page.locator('.aboard')).toBeVisible(); // everything open, as before
  await page.waitForTimeout(400);
  expect(calls).toEqual([]);
});

test('no backend: the site stays Free, the offer says it is not available and sign-in is not offered', async ({ page }) => {
  await gating(page);
  await mockApi(page, { config: null });
  await page.goto('/art-slide/premium');
  await expect(page.getByTestId('premium-soon')).toBeVisible();
  await expect(page.getByTestId('premium-subscribe')).toHaveCount(0);
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('account-unavailable')).toBeVisible();
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await expect(page.locator('.aboard')).toBeVisible(); // free painting still plays
});

test('signed out: sign in with Google; Subscribe needs it first', async ({ page }) => {
  await gating(page);
  const calls = await mockApi(page);
  await page.goto('/art-slide/account');
  const a = page.getByTestId('signin');
  await expect(a).toBeVisible();
  expect(await a.getAttribute('href')).toBe('/api/auth/google?return=%2Fart-slide%2Faccount');
  await page.goto('/art-slide/premium');
  await expect(page.getByTestId('premium-signin')).toBeVisible();
  await openSheet(page);
  await expect(page.getByTestId('premium-subscribe')).toBeDisabled(); // not before the visitor has read and agreed
  await page.getByTestId('premium-agree').check();
  await expect(page.getByTestId('premium-subscribe')).toBeEnabled();
  expect(calls.some((c) => c.startsWith('POST'))).toBe(false); // nothing is sent before the visitor acts
});

test('signed in on the Free plan: Subscribe starts Checkout through the server', async ({ page }) => {
  await gating(page);
  const calls = await mockApi(page, { me: { signedIn: true, premium: false, canPurchase: true, name: 'Ann Example', status: null } });
  await page.goto('/art-slide/premium');
  await expect(page.getByTestId('premium-signin')).toHaveCount(0);
  await openSheet(page);
  await page.getByTestId('premium-agree').check();
  await page.getByTestId('premium-subscribe').click();
  await expect(page).toHaveURL(/checkout=mock/);
  expect(calls).toContain('POST /api/billing/checkout');
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('account-name')).toHaveText('Ann Example');
  await expect(page.getByTestId('account-plan')).toHaveText('Free plan');
  await expect(page.getByTestId('manage')).toHaveCount(0);
});

test('Premium from the server: everything unlocked, no ads, Manage subscription and sign out work', async ({ page }) => {
  await gating(page);
  const calls = await mockApi(page, { me: PREMIUM });
  await page.goto('/art-slide/gallery');
  await expect(page.locator('a.gcard').first()).toBeVisible();
  await expect(page.locator('[data-testid^="lock-"]')).toHaveCount(0);
  await expect(page.getByTestId('ad-box')).toHaveCount(0);
  await page.goto('/art-slide/play/' + LOCKED);
  await expect(page.locator('.aboard')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('ad-box')).toHaveCount(0); // no slot and no leftover space
  await page.goto('/word-slide/daily');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('ad-box')).toHaveCount(0); // the whole site, not just ART SLIDE
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('account-plan')).toContainText('Premium');
  await page.getByTestId('manage').click();
  await expect(page).toHaveURL(/portal=mock/);
  expect(calls).toContain('POST /api/billing/portal');
  await page.goto('/art-slide/account');
  await page.getByTestId('signout').click();
  expect(calls).toContain('POST /api/auth/logout');
});

test('Premium that ends with the period says so', async ({ page }) => {
  await gating(page);
  await mockApi(page, { me: { ...PREMIUM, cancelAtPeriodEnd: true } });
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('account-plan')).toContainText('ends on');
});

test('a Free visitor still sees ads; a returning signed-in visitor sees none while the plan is being looked up', async ({ page }) => {
  await gating(page);
  await mockApi(page); // signed out
  await page.goto('/word-slide/daily');
  await expect(page.getByTestId('ad-box')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('slides:signed-in', '1'));
  await page.unroute('**/api/**');
  await mockApi(page, { me: PREMIUM, meDelayMs: 1500 });
  await page.goto('/word-slide/daily');
  await page.waitForTimeout(700); // the lookup is still running
  await expect(page.getByTestId('ad-box')).toHaveCount(0); // no flash of an ad
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('ad-box')).toHaveCount(0); // and Premium keeps it that way
});

test('after Checkout the page re-checks with the server instead of trusting the redirect', async ({ page }) => {
  await gating(page);
  const calls = await mockApi(page, { me: { signedIn: true, premium: false, canPurchase: true, name: 'Ann Example', status: null } });
  await page.goto('/art-slide/premium?checkout=success');
  await expect(page.getByTestId('premium')).toBeVisible();
  await expect.poll(() => calls).toContain('GET /api/billing/status?refresh=1');
  await openSheet(page);
  await expect(page.getByTestId('premium-subscribe')).toBeVisible(); // still Free until the server says otherwise
});

test('a locked painting opens for a Premium account but not for a Free one', async ({ page }) => {
  await gating(page);
  await mockApi(page, { me: { signedIn: true, premium: false, name: 'x', status: null } });
  await page.goto('/art-slide/play/' + LOCKED);
  await expect(page.getByTestId('premium-reason')).toBeVisible();
  await page.unroute('**/api/**');
  await mockApi(page, { me: PREMIUM });
  await page.goto('/art-slide/play/' + LOCKED);
  await expect(page.locator('.aboard')).toBeVisible();
});

test('purchases stay off while the operator details are missing or the server has them switched off', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('slides:dev-gating', '1')); // no dev-operator flag: details are empty
  await mockApi(page);
  await page.goto('/art-slide/premium');
  if (OPERATOR.effectiveDate === '') { // once the publication date is set the details are complete and only the server switch keeps purchases off
    await expect(page.getByTestId('premium-subscribe')).toHaveCount(0);
    await expect(page.getByTestId('premium-soon')).toBeVisible();
  }

  const p2 = await page.context().newPage();
  await p2.addInitScript(() => { localStorage.setItem('slides:dev-gating', '1'); localStorage.setItem('slides:dev-operator', '1'); });
  await mockApi(p2, { config: { auth: true, billing: true, purchases: false } });
  await p2.goto('/art-slide/premium');
  await expect(p2.getByTestId('premium-subscribe')).toHaveCount(0);
});

test('the commercial-law notice page exists, is complete, and the banner says what is still open (the publication date)', async ({ page }) => {
  await page.goto('/commerce');
  await page.getByTestId('legal-lang-ja').click();
  await expect(page.getByTestId('commerce')).toContainText('月額200円');
  await expect(page.getByTestId('commerce')).toContainText('解約');
  if (OPERATOR.effectiveDate === '') {
    await expect(page.getByTestId('commerce-incomplete')).toBeVisible(); // the effective date is not set yet
    await expect(page.getByTestId('commerce-incomplete')).toContainText('制定日');
  } else await expect(page.getByTestId('commerce-incomplete')).toHaveCount(0);
  await expect(page.getByTestId('commerce')).not.toContainText('【未設定】'); // the notice itself has no gaps
});

test('the daily puzzle is open to everyone, also when its painting is a Premium one', async ({ page }) => {
  await gating(page);
  await mockApi(page);
  await page.goto('/art-slide/daily');
  await expect(page.locator('.aboard')).toBeVisible();
  await expect(page.getByTestId('premium')).toHaveCount(0);
});

// ---- limited live test: ?tester lets the tester sign in and see their account id although the paid plan is not on in this build ----
test('allowlist: a signed-in account that may not buy sees no button, only "not available"', async ({ page }) => {
  await gating(page);
  await mockApi(page, { me: { signedIn: true, premium: false, canPurchase: false, name: 'Ann Example', status: null } });
  await page.goto('/art-slide/premium');
  await expect(page.getByTestId('premium-soon')).toBeVisible();
  await expect(page.getByTestId('premium-subscribe')).toHaveCount(0);
  await expect(page.getByTestId('purchase-facts')).toHaveCount(0);
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('account-subscribe')).toHaveCount(0);
});

test('allowlist: an account the server allows sees the button (after the consent box)', async ({ page }) => {
  await gating(page);
  await mockApi(page, { me: { signedIn: true, premium: false, canPurchase: true, name: 'Ann Example', status: null } });
  await page.goto('/art-slide/premium');
  await openSheet(page);
  await expect(page.getByTestId('premium-subscribe')).toBeDisabled();
  await page.getByTestId('premium-agree').check();
  await expect(page.getByTestId('premium-subscribe')).toBeEnabled();
});

test('tester mode without the paid plan in the build: ?tester signs in and shows the account id; nothing is offered to a visitor who may not buy', async ({ page }) => {
  // no dev-gating: this is the production build state (VITE_PREMIUM_ENABLED off)
  const calls = await mockApi(page, { config: { auth: true, billing: true, purchases: true } });
  await page.goto('/art-slide/premium?tester=1');
  await expect(page.getByTestId('tester-box')).toBeVisible();
  expect(await page.getByTestId('tester-signin').getAttribute('href')).toBe('/api/auth/google?return=%2Fart-slide%2Fpremium%3Ftester%3D1');
  await expect(page.getByTestId('premium-subscribe')).toHaveCount(0); // anonymous: no purchase button, only the tester box's sign-in link
  await page.unroute('**/api/**');
  await mockApi(page, { me: { signedIn: true, premium: false, canPurchase: false, name: 'Ann', status: null, id: 'acct-123456789' } as Me & { id: string } });
  await page.goto('/art-slide/premium?tester=1');
  await expect(page.getByTestId('tester-id')).toHaveText('acct-123456789');
  await expect(page.getByTestId('tester-state')).toContainText('may not buy');
  await expect(page.getByTestId('premium-subscribe')).toHaveCount(0);
  await expect(page.getByTestId('premium-soon')).toBeVisible();
  void calls;
});

test('without ?tester the premium page makes no API call at all (production build state)', async ({ page }) => {
  const calls = await mockApi(page, { config: { auth: true, billing: true, purchases: true } });
  await page.goto('/art-slide/premium');
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);
  await expect(page.getByTestId('tester-box')).toHaveCount(0);
  await expect(page.getByTestId('premium-subscribe')).toHaveCount(0);
  await expect(page.getByTestId('premium-soon')).toBeVisible();
});

test('the sign-in page is reachable while the paid plan is off: /art-slide/account?tester', async ({ page }) => {
  // no dev-gating: the production build state
  await mockApi(page, { config: { auth: true, billing: true, purchases: false } });
  await page.goto('/art-slide/account?tester=1');
  const a = page.getByTestId('signin');
  await expect(a).toBeVisible();
  expect(await a.getAttribute('href')).toBe('/api/auth/google?return=%2Fart-slide%2Faccount%3Ftester%3D1');
  await page.goto('/art-slide/account'); // without ?tester it stays "unavailable"
  await expect(page.getByTestId('account-unavailable')).toBeVisible();
  await expect(page.getByTestId('signin')).toHaveCount(0);
});

for (const vw of [320, 390]) test(`the account button on the ART SLIDE home at ${vw}px: "Sign in" when signed out (straight to Google), "Account" when signed in`, async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile' && vw === 320, 'phone width');
  await page.setViewportSize({ width: vw, height: 700 });
  await gating(page);
  await mockApi(page);
  await page.goto('/art-slide');
  await page.evaluate(() => document.fonts.ready); // the title's letters are laid out with the real font
  const btn = page.getByTestId('home-account');
  await expect(btn).toHaveAttribute('data-state', 'signed-out');
  await expect(btn).toHaveAttribute('aria-label', 'Sign in');
  expect(await btn.getAttribute('href')).toBe('/api/auth/google?return=%2Fart-slide'); // no extra page in between
  // wait until the page has stopped gliding in (the position is the same on two reads), instead of a fixed pause
  let last = -1;
  await expect.poll(async () => { const x = (await btn.boundingBox())!.x; const same = Math.abs(x - last) < 0.5; last = x; return same; }, { timeout: 5000 }).toBe(true);
  const box = (await btn.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(40);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const title = (await page.locator('.art-home-title').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(title.y + 1); // on a phone it shares a row (with Settings) above the title: never on top of the letters
  expect(box.x + box.width).toBeLessThanOrEqual(vw); // inside the screen
  expect(box.x + box.width).toBeGreaterThan(vw / 2); // at the right (Settings sits beside it)
  await expect(btn.locator('span')).toBeVisible(); // with its word, not just an icon
  await expect(btn.locator('span')).toHaveText('Sign in');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  // signed in: the same place, "Account", and it opens the account page
  await page.unroute('**/api/**');
  await mockApi(page, { me: { signedIn: true, premium: false, name: 'Ann', status: null } });
  await page.goto('/art-slide');
  const acct = page.getByTestId('home-account');
  await expect(acct).toHaveAttribute('data-state', 'signed-in');
  await expect(acct).toHaveAttribute('aria-label', 'Account');
  await acct.click();
  await expect(page).toHaveURL(/\/art-slide\/account$/);
  await expect(page.getByTestId('account-name')).toBeVisible();
});

test('the home button says "Sign in" in Japanese when signed out', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wordslide:save', JSON.stringify({ version: 1, settings: { lang: 'ja', theme: 'system', colorblind: false, adConsent: null }, completed: 0, noHintClears: 0, dailyHistory: {}, endlessStreak: 0, maxEndlessStreak: 0, bests: { easy: {}, normal: {}, hard: {} }, history: [], inProgress: {}, lastDifficulty: 'normal' })));
  await gating(page);
  await mockApi(page);
  await page.goto('/art-slide');
  await expect(page.getByTestId('home-account')).toHaveAttribute('aria-label', 'ログイン');
});

test('account page: Sync on/off and Sign out sit side by side, and the sync text is short', async ({ page }) => {
  await gating(page);
  await mockApi(page, { config: { auth: true, billing: true, purchases: true, googleClientId: 'cid.apps.googleusercontent.com' } as never, me: { signedIn: true, premium: false, name: 'Ann', status: null } });
  await page.goto('/art-slide/account');
  const on = page.getByTestId('sync-enable');
  const out = page.getByTestId('signout');
  await expect(on).toBeVisible();
  const [a, b] = await Promise.all([on.boundingBox(), out.boundingBox()]);
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2); // one row
  expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
  expect(Math.abs(a!.width - b!.width)).toBeLessThan(2); // equal widths
  expect(a!.height).toBeGreaterThanOrEqual(40);
  const desc = await page.getByTestId('sync').locator('p').first().innerText();
  expect(desc.length).toBeLessThan(80); // one short sentence
  expect(desc).toContain('Google Drive');
});

test('without the paid plan the home has no account button (nothing to sign in for)', async ({ page }) => {
  await page.goto('/art-slide');
  await expect(page.getByTestId('exhibit')).toBeVisible();
  await expect(page.getByTestId('home-account')).toHaveCount(0);
});

// ---- a purchase that cannot start is explained, never silent ----
const FREE_BUYER: Me = { signedIn: true, premium: false, canPurchase: true, name: 'Ann Example', status: null };
async function tryToBuy(page: Page, checkout: { status: number; body?: unknown } | 'abort') {
  await gating(page);
  const calls = await mockApi(page, { me: FREE_BUYER, checkout });
  await page.goto('/art-slide/premium');
  await openSheet(page);
  await page.getByTestId('premium-agree').check();
  await page.getByTestId('premium-subscribe').click();
  return calls;
}
for (const [name, checkout, text, code] of [
  ['the payment setup is wrong (503)', { status: 503, body: { error: 'live_key_not_allowed' } }, /Please try again in a moment/, 'live_key_not_allowed'],
  ['Stripe fails (500)', { status: 500, body: { error: 'server_error' } }, /Please try again in a moment/, 'server_error'],
  ['the answer has no payment address', { status: 200, body: {} }, /Please try again in a moment/, 'no_url'],
  ['the connection fails', 'abort', /Please try again in a moment/, 'network'],
  ['too many attempts (429)', { status: 429, body: { error: 'rate_limited' } }, /Too many attempts/, 'rate_limited'],
  ['a payment is still being confirmed (409)', { status: 409, body: { error: 'payment_pending' } }, /being confirmed/, 'payment_pending'],
] as const) {
  test(`checkout: ${name} → the visitor is told, with a code, and can try again`, async ({ page }) => {
    const calls = await tryToBuy(page, checkout);
    const box = page.getByTestId('checkout-error');
    await expect(box).toBeVisible();
    await expect(box).toContainText(text);
    await expect(page.getByTestId('checkout-error-code')).toContainText(code);
    await expect(page).toHaveURL(/\/art-slide\/premium$/); // still here
    await openSheet(page);
    await expect(page.getByTestId('premium-subscribe')).toBeEnabled(); // and can try again
    expect(calls.filter((c) => c === 'POST /api/billing/checkout')).toHaveLength(1);
  });
}

test('checkout: already subscribed (409) → says so and offers the account page', async ({ page }) => {
  await tryToBuy(page, { status: 409, body: { error: 'already_subscribed' } });
  await expect(page.getByTestId('checkout-error')).toContainText(/already have Premium/);
  await page.getByTestId('checkout-error').getByRole('button').click();
  await expect(page).toHaveURL(/\/art-slide\/account$/);
});

test('checkout: signed out in the meantime (401) → asks to sign in again, with the link', async ({ page }) => {
  await tryToBuy(page, { status: 401, body: { error: 'signin_required' } });
  await expect(page.getByTestId('checkout-error')).toContainText(/sign-in has expired/);
  expect(await page.getByTestId('checkout-error').locator('a').getAttribute('href')).toBe('/api/auth/google?return=%2Fart-slide%2Fpremium');
});

test('checkout: the button cannot be pressed twice while the request is running', async ({ page }) => {
  await gating(page);
  let posts = 0;
  await mockApi(page, { me: FREE_BUYER });
  await page.route('**/api/billing/checkout', async (route) => { posts++; await new Promise((r) => setTimeout(r, 800)); await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"x_y"}' }); });
  await page.goto('/art-slide/premium');
  await openSheet(page);
  await page.getByTestId('premium-agree').check();
  const btn = page.getByTestId('premium-subscribe');
  await btn.click();
  await expect(btn).toBeDisabled(); // busy: a second click is impossible
  await expect(page.getByTestId('checkout-error')).toBeVisible();
  expect(posts).toBe(1);
});

test('the Stripe address is only followed when it is https (or on this site)', async ({ page }) => {
  await gating(page);
  await mockApi(page, { me: FREE_BUYER });
  await page.route('**/api/billing/checkout', (route) => route.fulfill({ contentType: 'application/json', body: '{"url":"javascript:alert(1)"}' }));
  await page.goto('/art-slide/premium');
  await openSheet(page);
  await page.getByTestId('premium-agree').check();
  await page.getByTestId('premium-subscribe').click();
  await expect(page.getByTestId('checkout-error-code')).toContainText('no_url');
  await expect(page).toHaveURL(/\/art-slide\/premium$/);
});

test('gallery: Premium-locked paintings are at the bottom of every group, whichever grouping is chosen', async ({ page }) => {
  await gating(page);
  await mockApi(page); // a free visitor
  await page.goto('/art-slide/gallery');
  await expect(page.locator('a.gcard').first()).toBeVisible();
  const lockedLast = async (label: string) => {
    const flags = await page.locator('a.gcard').evaluateAll((els) => els.map((e) => !!e.querySelector('[data-testid^="lock-"]')));
    expect(flags.length, label).toBeGreaterThan(0);
    const first = flags.indexOf(true);
    expect(first === -1 || flags.slice(first).every(Boolean), `${label}: an open painting comes after a locked one`).toBe(true);
    return flags.filter(Boolean).length;
  };
  const choose = async (name: RegExp) => {
    await page.locator('[data-testid=group-by]:visible').click();
    await page.locator('[data-testid=group-by-options]:visible').getByRole('option', { name }).click();
  };
  let seenLocked = 0;
  for (const [name, label] of [[/Theme/, 'theme'], [/Era/, 'era']] as const) {
    await choose(name);
    const tabs = page.locator('[data-testid^="group-tab-"]');
    const n = await tabs.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) { await tabs.nth(i).click(); seenLocked += await lockedLast(`${label} tab ${i}`); }
  }
  await choose(/No grouping/);
  seenLocked += await lockedLast('no grouping');
  expect(seenLocked).toBeGreaterThan(20); // (the check really looked at locked paintings)
  // the same with the random order
  await page.getByTestId('gal-random').click();
  await lockedLast('no grouping, random');
  // and there is no "Artist" grouping
  await page.locator('[data-testid=group-by]:visible').click();
  await expect(page.locator('[data-testid=group-by-options]:visible').getByRole('option', { name: /Artist/ })).toHaveCount(0);
});

test('gallery: a Premium visitor sees no locks and the order is the normal one', async ({ page }) => {
  await gating(page);
  await mockApi(page, { me: PREMIUM });
  await page.goto('/art-slide/gallery');
  await expect(page.locator('a.gcard').first()).toBeVisible();
  await expect(page.locator('[data-testid^="lock-"]')).toHaveCount(0);
});

test('the long "before you subscribe" text is a pull-down: closed by default, the agreement and the button stay visible', async ({ page }) => {
  await gating(page);
  await mockApi(page, { me: { signedIn: true, premium: false, canPurchase: true, name: 'Ann Example', status: null } });
  await page.goto('/art-slide/premium');
  const d = page.getByTestId('purchase-details');
  await expect(d).toBeVisible();
  await expect(page.getByTestId('purchase-seller')).toBeHidden(); // the long text is folded away
  await expect(page.getByTestId('premium-agree')).toBeVisible();
  await expect(page.getByTestId('premium-subscribe')).toBeVisible();
  await d.locator('summary').click();
  await expect(page.getByTestId('purchase-seller')).toBeVisible();
  await d.locator('summary').click();
  await expect(page.getByTestId('purchase-seller')).toBeHidden();
});
