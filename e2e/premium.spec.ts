import { expect, test, type Page } from '@playwright/test';
import { OPERATOR } from '../src/legal/operator';

/** The Worker API is replaced by in-page mocks: these tests are about what the site does with its answers. */
type Me = { signedIn: boolean; premium: boolean; canPurchase?: boolean; name?: string; status?: string | null; currentPeriodEnd?: number | null; cancelAtPeriodEnd?: boolean };
async function mockApi(page: Page, opts: { config?: { auth: boolean; billing: boolean; purchases: boolean } | null; me?: Me; meDelayMs?: number } = {}) {
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
    if (path === '/api/billing/checkout') return ok({ url: '/art-slide/premium?checkout=mock' });
    if (path === '/api/billing/portal') return ok({ url: '/art-slide/account?portal=mock' });
    if (path === '/api/auth/logout' || path === '/api/account/delete') return ok({ ok: true, deleted: true });
    return route.fulfill({ status: 404, body: '{}' });
  });
  return calls;
}
const gating = (page: Page) => page.addInitScript(() => { localStorage.setItem('slides:dev-gating', '1'); localStorage.setItem('slides:dev-operator', '1'); });
const PREMIUM: Me = { signedIn: true, premium: true, name: 'Ann Example', status: 'active', currentPeriodEnd: Math.floor(Date.now() / 1000) + 20 * 86400, cancelAtPeriodEnd: false };
const LOCKED = 'monet-stacks-of-wheat-end-of-summer';

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
