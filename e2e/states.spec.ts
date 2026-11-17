import { expect, test, type Page } from '@playwright/test';
import { FREE_ARTWORK_IDS } from '../src/premium/freeList';

/**
 * Every kind of visitor, with the server's answers replaced by mocks:
 * signed out · Free · Premium · Premium that is set to end · contract ended.
 */
type Me = { signedIn: boolean; premium: boolean; id?: string; name?: string; status?: string | null; currentPeriodEnd?: number | null; cancelAtPeriodEnd?: boolean };
const END = Math.floor(Date.now() / 1000) + 20 * 86400;
const STATES: Record<string, { me: Me; premium: boolean }> = {
  'signed out': { me: { signedIn: false, premium: false }, premium: false },
  Free: { me: { signedIn: true, premium: false, id: 'u1', name: 'Ann', status: null }, premium: false },
  Premium: { me: { signedIn: true, premium: true, id: 'u1', name: 'Ann', status: 'active', currentPeriodEnd: END, cancelAtPeriodEnd: false }, premium: true },
  'Premium, set to end': { me: { signedIn: true, premium: true, id: 'u1', name: 'Ann', status: 'active', currentPeriodEnd: END, cancelAtPeriodEnd: true }, premium: true },
  'contract ended': { me: { signedIn: true, premium: false, id: 'u1', name: 'Ann', status: 'canceled', currentPeriodEnd: END - 40 * 86400, cancelAtPeriodEnd: false }, premium: false },
};
const LOCKED = 'monet-stacks-of-wheat-end-of-summer';

async function visit(page: Page, me: Me) {
  await page.addInitScript(() => { localStorage.setItem('slides:dev-gating', '1'); localStorage.setItem('slides:dev-operator', '1'); });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (b: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (path === '/api/config') return json({ auth: true, billing: true, purchases: true });
    if (path === '/api/me' || path === '/api/billing/status') return json(me);
    if (path === '/api/billing/portal') return json({ url: '/art-slide/account?portal=1' });
    if (path === '/api/billing/checkout') return json({ url: '/art-slide/premium?checkout=mock' });
    return route.fulfill({ status: 404, body: '{}' });
  });
}

for (const [name, { me, premium }] of Object.entries(STATES)) {
  test.describe(name, () => {
    test.beforeEach(async ({ page }) => { await visit(page, me); });

    test('paintings: locks only for those without Premium; a locked address opens the offer or the game', async ({ page }) => {
      await page.goto('/art-slide/gallery');
      await expect(page.locator('a.gcard').first()).toBeVisible();
      const ids = await page.locator('a.gcard').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(4)));
      await expect(page.locator('[data-testid^="lock-"]')).toHaveCount(premium ? 0 : ids.filter((i) => !FREE_ARTWORK_IDS.includes(i)).length);
      await page.goto(`/art-slide/play/${LOCKED}`);
      if (premium) await expect(page.locator('.aboard')).toBeVisible();
      else {
        await expect(page.getByTestId('premium-reason')).toBeVisible();
        await expect(page.locator('.aboard')).toHaveCount(0);
      }
      await page.goto('/art-slide/play/van-gogh-bedroom'); // a Free painting is open to everybody
      await expect(page.locator('.aboard')).toBeVisible();
    });

    test('levels: 3 to 5 for everybody, 6 and 7 with Premium', async ({ page }) => {
      await page.goto('/art-slide/play/van-gogh-bedroom');
      await expect(page.locator('.aboard')).toBeVisible();
      await page.locator('[data-testid=art-size-select]:visible').click();
      const opts = page.locator('[data-testid=art-size-select-options]:visible').getByRole('option');
      await expect(opts).toHaveCount(5);
      for (const i of [0, 1, 2]) await expect(opts.nth(i).getByTestId('size-lock')).toHaveCount(0);
      for (const i of [3, 4]) await expect(opts.nth(i).getByTestId('size-lock')).toHaveCount(premium ? 0 : 1);
      await opts.last().click(); // level 7
      if (premium) {
        await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('artslide:save') ?? '{}').inProgress?.free?.puzzle?.size))).toBe(7);
      } else {
        await expect(page.getByTestId('premium')).toBeVisible();
      }
    });

    test('the daily puzzle is open to everybody', async ({ page }) => {
      await page.goto('/art-slide/daily');
      await expect(page.locator('.aboard')).toBeVisible();
      await expect(page.getByTestId('premium')).toHaveCount(0);
    });

    test('ads: shown to everybody without Premium, in every game; never to Premium', async ({ page }) => {
      for (const url of ['/art-slide/play/van-gogh-bedroom', '/word-slide/daily', '/big-slide/daily']) {
        await page.goto(url);
        await page.waitForTimeout(700);
        await expect(page.getByTestId('ad-box')).toHaveCount(premium ? 0 : 1);
      }
    });

    test('My Photos: tools for Premium, the offer for everybody else', async ({ page }) => {
      await page.goto('/art-slide/photos');
      if (premium) {
        await expect(page.getByTestId('photo-add')).toBeVisible();
        await expect(page.getByTestId('premium-reason')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('premium-reason')).toContainText('own photos');
        await expect(page.getByTestId('photo-add')).toHaveCount(0);
      }
    });

    test('account and offer screens say the right thing', async ({ page }) => {
      await page.goto('/art-slide/account');
      if (!me.signedIn) {
        await expect(page.getByTestId('signin')).toBeVisible();
        await expect(page.getByTestId('sync')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('account-name')).toHaveText('Ann');
        const plan = page.getByTestId('account-plan');
        if (name === 'Premium') await expect(plan).toContainText('renews on');
        else if (name === 'Premium, set to end') await expect(plan).toContainText('ends on');
        else await expect(plan).toHaveText('Free plan');
        await expect(page.getByTestId('manage')).toHaveCount(premium ? 1 : 0);
        await expect(page.getByTestId('account-subscribe')).toHaveCount(premium ? 0 : 1); // ended contracts can subscribe again
        await expect(page.getByTestId('signout')).toBeVisible();
      }
      await page.goto('/art-slide/premium');
      if (premium) {
        await expect(page.getByTestId('premium-active')).toBeVisible();
        await expect(page.getByTestId('premium-manage')).toBeVisible();
        await expect(page.getByTestId('premium-subscribe')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('premium-subscribe')).toBeDisabled();
        await page.getByTestId('premium-agree').check();
        await expect(page.getByTestId('premium-subscribe')).toBeEnabled();
        await expect(page.getByTestId('premium-active')).toHaveCount(0);
        if (!me.signedIn) await expect(page.getByTestId('premium-signin')).toBeVisible();
      }
    });
  });
}

test('after Checkout the page says it is confirming, then shows Premium once the server says so', async ({ page }) => {
  let premium = false;
  await page.addInitScript(() => { localStorage.setItem('slides:dev-gating', '1'); localStorage.setItem('slides:dev-operator', '1'); });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (b: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (path === '/api/config') return json({ auth: true, billing: true, purchases: true });
    if (path === '/api/me' || path === '/api/billing/status') return json({ signedIn: true, id: 'u1', name: 'Ann', premium, status: premium ? 'active' : null, currentPeriodEnd: END, cancelAtPeriodEnd: false });
    return route.fulfill({ status: 404, body: '{}' });
  });
  await page.goto('/art-slide/premium?checkout=success');
  await expect(page.getByTestId('premium-thanks')).toBeVisible();
  await expect(page.getByTestId('premium-subscribe')).toBeVisible(); // not Premium until the server says so
  premium = true; // the webhook arrived
  await expect(page.getByTestId('premium-active')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('premium-thanks')).toHaveCount(0);
});

test('a game saved at a Premium-only level is not carried on after the contract ended', async ({ page }) => {
  // Premium until the test says the contract ended (the init script runs on every page load)
  await page.addInitScript(() => { localStorage.setItem('slides:dev-gating', '1'); if (!localStorage.getItem('test:ended')) localStorage.setItem('slides:dev-premium', '1'); });
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await expect(page.locator('.aboard')).toBeVisible();
  await page.locator('[data-testid=art-size-select]:visible').click();
  await page.locator('[data-testid=art-size-select-options]:visible').getByRole('option').last().click();
  const size = () => page.evaluate(() => JSON.parse(localStorage.getItem('artslide:save') ?? '{}').inProgress?.free?.puzzle?.size);
  await expect.poll(size).toBe(7);
  await page.evaluate(() => { localStorage.setItem('test:ended', '1'); localStorage.removeItem('slides:dev-premium'); }); // the contract ends
  await page.goto('/art-slide/play'); // "resume"
  await expect(page.locator('.aboard')).toBeVisible();
  await expect.poll(size).toBeLessThanOrEqual(5);
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await expect.poll(size).toBeLessThanOrEqual(5);
});

test('dev switch: slides:dev-account stands in for the server so each state can be looked at without a backend', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('slides:dev-gating', '1');
    localStorage.setItem('slides:dev-account', JSON.stringify({ config: { auth: true, billing: true, purchases: false }, me: { signedIn: true, premium: true, id: 'u', name: 'Dev Premium', status: 'active', currentPeriodEnd: Math.floor(Date.now() / 1000) + 86400 * 10, cancelAtPeriodEnd: true } }));
  });
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('account-name')).toHaveText('Dev Premium');
  await expect(page.getByTestId('account-plan')).toContainText('ends on');
  await page.goto('/art-slide/gallery');
  await expect(page.locator('[data-testid^="lock-"]')).toHaveCount(0);
});
