import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
const AD_HOST = 'https://bauval.org/**';
/** A stand-in for the ad script: it only reports the atOptions it was given, inside the iframe. */
const FAKE_AD = "document.body.innerHTML = '<div id=\"fake\">AD ' + atOptions.width + 'x' + atOptions.height + ' ' + atOptions.key.slice(0, 4) + ' ' + atOptions.format + '</div>';";

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && !m.text().includes('net::ERR') && list.push(m.text()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

const pages = [
  ['ART SLIDE', '/art-slide/play/van-gogh-bedroom'],
  ['WORD SLIDE', '/word-slide/daily'],
  ['BIG SLIDE', '/big-slide/daily'],
] as const;

async function boxOf(page: Page) {
  await page.waitForTimeout(450); // let the page finish gliding in
  return (await page.getByTestId('ad-placeholder').boundingBox())!;
}

for (const [name, url] of pages) {
  test(`${name}: one labelled ad slot below the game, in the dev placeholder`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByTestId('ad-box')).toHaveCount(1); // at most one per page
    await expect(page.locator('.ad-label')).toHaveText('Advertisement');
    await expect(page.getByTestId('ad-iframe')).toHaveCount(0); // dev never requests real ads
    // below the board and its controls
    const ad = (await page.getByTestId('ad-box').boundingBox())!;
    const lastControl = name === 'ART SLIDE' ? page.getByTestId('restart') : name === 'WORD SLIDE' ? page.getByRole('button', { name: 'RESTART' }) : page.getByRole('button', { name: 'RESTART' });
    const ctl = (await lastControl.boundingBox())!;
    expect(ad.y).toBeGreaterThanOrEqual(ctl.y + ctl.height - 1);
  });
}

test('size follows the screen: 728x90 from 728px, 300x250 below, scaled to fit very narrow screens, never overflowing', async ({ page }) => {
  const cases: [number, string, number, number][] = [
    [1280, 'desktop', 728, 90],
    [728, 'desktop', 728, 90],
    [727, 'mobile', 300, 250],
    [412, 'mobile', 300, 250],
  ];
  for (const [w, unit, aw, ah] of cases) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/word-slide/daily');
    await expect(page.getByTestId('ad-box')).toHaveAttribute('data-unit', unit);
    const b = await boxOf(page);
    expect([Math.round(b.width), Math.round(b.height)]).toEqual([aw, ah]);
    expect(b.x).toBeGreaterThanOrEqual(-0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
  await page.setViewportSize({ width: 280, height: 800 });
  await page.goto('/word-slide/daily');
  const narrow = await boxOf(page);
  expect(narrow.width).toBeLessThan(300);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(280 + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('the slot switches size when the window is resized, and stays a single slot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/big-slide/daily');
  await expect(page.getByTestId('ad-box')).toHaveAttribute('data-unit', 'desktop');
  await page.setViewportSize({ width: 500, height: 900 });
  await expect(page.getByTestId('ad-box')).toHaveAttribute('data-unit', 'mobile');
  await expect(page.getByTestId('ad-box')).toHaveCount(1);
});

test('the label is translated', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('lang-select').selectOption('ja');
  await page.goto('/word-slide/daily');
  await expect(page.locator('.ad-label')).toHaveText('広告');
});

test.describe('live ads (dev-only ?ads=live with a stand-in script)', () => {
  test('the ad runs in a sandboxed iframe with its own atOptions; the page stays clean', async ({ page }) => {
    let hits = 0;
    await page.route(AD_HOST, (r) => {
      hits++;
      return r.fulfill({ contentType: 'application/javascript', body: FAKE_AD });
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/word-slide/daily?ads=live');
    const frame = page.frameLocator('[data-testid=ad-iframe]');
    await expect(frame.locator('#fake')).toHaveText("AD 728x90 d1f4 iframe");
    const sandbox = await page.getByTestId('ad-iframe').getAttribute('sandbox');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin'); // cannot reach into the page
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(await page.evaluate(() => 'atOptions' in window)).toBe(false); // nothing leaks into the app's window
    expect(await page.locator('script[src*="bauval"]').count()).toBe(0); // no ad script in the app document itself
    // playing re-renders the page; the ad is not inserted again
    const before = hits;
    await page.getByTestId('hint-first-0').click();
    await page.getByTestId('hint-first-1').click();
    await page.waitForTimeout(400);
    expect(hits).toBe(before);
    expect(await page.getByTestId('ad-iframe').count()).toBe(1);
    // the game is fully usable next to the ad
    await expect(page.getByTestId('slots-0').locator('.slot-l.shown')).toHaveCount(1);
  });

  test('each size gets its own key and options (no clash between the two units)', async ({ page }) => {
    await page.route(AD_HOST, (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_AD }));
    await page.setViewportSize({ width: 412, height: 900 });
    await page.goto('/art-slide/play/van-gogh-bedroom?ads=live');
    await expect(page.frameLocator('[data-testid=ad-iframe]').locator('#fake')).toHaveText('AD 300x250 7ce6 iframe');
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.frameLocator('[data-testid=ad-iframe]').locator('#fake')).toHaveText('AD 728x90 d1f4 iframe');
    await expect(page.getByTestId('ad-iframe')).toHaveCount(1);
  });

  test('a blocked or failing ad (ad blocker, network error) never affects the game', async ({ page }) => {
    await page.route(AD_HOST, (r) => r.abort());
    await page.goto('/art-slide/play/monet-water-lilies?ads=live');
    await expect(page.getByTestId('ad-box')).toBeVisible();
    const sol = await page.evaluate(async () => {
      for (let i = 0; i < 50 && !localStorage.getItem('artslide:save'); i++) await new Promise((r) => setTimeout(r, 50));
      return JSON.parse(localStorage.getItem('artslide:save')!).inProgress.free.puzzle.solution as number[];
    });
    await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
    await expect(page.getByTestId('moves')).toHaveText('1');
  });

  test('outside Europe ads run by default and stop when switched off in Settings', async ({ page }) => {
    await page.route(AD_HOST, (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_AD }));
    await page.goto('/word-slide/daily?ads=live');
    await expect(page.getByTestId('ad-iframe')).toBeVisible();
    await expect(page.getByTestId('consent-accept')).toHaveCount(0); // no banner where opt-in is not required
    await page.goto('/settings?ads=live');
    await expect(page.getByTestId('ad-cookies')).toBeChecked();
    await page.getByTestId('ad-cookies').uncheck();
    await page.goto('/word-slide/daily?ads=live');
    await expect(page.getByTestId('ad-box')).toHaveCount(0); // the choice is respected
    await expect(page.getByTestId('hint-first-0')).toBeVisible();
  });

  test('in Europe nothing loads until the visitor accepts', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
    const page = await ctx.newPage();
    const requested: string[] = [];
    await page.route(AD_HOST, (r) => {
      requested.push(r.request().url());
      return r.fulfill({ contentType: 'application/javascript', body: FAKE_AD });
    });
    await page.goto('/word-slide/daily?ads=live');
    await expect(page.getByTestId('consent-accept')).toBeVisible();
    await expect(page.getByTestId('ad-iframe')).toHaveCount(0);
    expect(requested).toEqual([]);
    await page.getByTestId('consent-accept').click();
    await expect(page.getByTestId('ad-iframe')).toBeVisible();
    await expect.poll(() => requested.length).toBe(1);
    await page.reload();
    await expect(page.getByTestId('consent-accept')).toHaveCount(0); // remembered
    await expect(page.getByTestId('ad-iframe')).toBeVisible();
    // declining stops ads for good
    await page.goto('/settings?ads=live');
    await page.getByTestId('ad-cookies').uncheck();
    await page.goto('/word-slide/daily?ads=live');
    await expect(page.getByTestId('ad-box')).toHaveCount(0);
    await ctx.close();
  });

  test('declining in Europe loads no ad at all', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'Europe/Paris', locale: 'fr-FR' });
    const page = await ctx.newPage();
    let hits = 0;
    await page.route(AD_HOST, (r) => { hits++; return r.abort(); });
    await page.goto('/big-slide/daily?ads=live');
    await page.getByTestId('consent-decline').click();
    await page.waitForTimeout(500);
    expect(hits).toBe(0);
    await expect(page.getByTestId('ad-box')).toHaveCount(0);
    await ctx.close();
  });
});

test('privacy policy covers the ad network and the opt-out', async ({ page }) => {
  await page.goto('/privacy');
  const text = await page.locator('.prose').innerText();
  expect(text).toMatch(/Adsterra/);
  expect(text).toMatch(/cookies/i);
  expect(text).toMatch(/EU|EEA|Switzerland/);
  expect(text).toMatch(/Settings/);
});
