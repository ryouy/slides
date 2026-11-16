import { expect, test, type Page } from '@playwright/test';

/** The Worker API is replaced by in-page mocks: these tests are about what the site does with its answers. */
type Me = { signedIn: boolean; premium: boolean; name?: string; status?: string | null; currentPeriodEnd?: number | null; cancelAtPeriodEnd?: boolean };
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
  await expect(page.getByTestId('premium-subscribe')).toBeDisabled();
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
  await expect(page.getByTestId('premium-subscribe')).toBeEnabled();
  expect(calls.some((c) => c.startsWith('POST'))).toBe(false); // nothing is sent before the visitor acts
});

test('signed in on the Free plan: Subscribe starts Checkout through the server', async ({ page }) => {
  await gating(page);
  const calls = await mockApi(page, { me: { signedIn: true, premium: false, name: 'Ann Example', status: null } });
  await page.goto('/art-slide/premium');
  await expect(page.getByTestId('premium-signin')).toHaveCount(0);
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
  const calls = await mockApi(page, { me: { signedIn: true, premium: false, name: 'Ann Example', status: null } });
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
  await expect(page.getByTestId('premium-subscribe')).toBeDisabled();
  await expect(page.getByTestId('premium-soon')).toBeVisible();

  const p2 = await page.context().newPage();
  await p2.addInitScript(() => { localStorage.setItem('slides:dev-gating', '1'); localStorage.setItem('slides:dev-operator', '1'); });
  await mockApi(p2, { config: { auth: true, billing: true, purchases: false } });
  await p2.goto('/art-slide/premium');
  await expect(p2.getByTestId('premium-subscribe')).toBeDisabled();
});

test('the commercial-law notice page exists and says what is still missing', async ({ page }) => {
  await page.goto('/commerce');
  await expect(page.getByTestId('commerce')).toContainText('月額 200円（税込）');
  await expect(page.getByTestId('commerce')).toContainText('解約');
  await expect(page.getByTestId('commerce-incomplete')).toBeVisible(); // details not supplied yet
  await expect(page.getByTestId('commerce')).toContainText('（未設定）');
});

test('the daily puzzle is open to everyone, also when its painting is a Premium one', async ({ page }) => {
  await gating(page);
  await mockApi(page);
  await page.goto('/art-slide/daily');
  await expect(page.locator('.aboard')).toBeVisible();
  await expect(page.getByTestId('premium')).toHaveCount(0);
});
