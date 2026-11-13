import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('net::ERR_FAILED') && !m.text().includes('Failed to load resource') && list.push(m.text()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

const readArt = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('artslide:save') ?? '{}'));
async function solution(page: Page, mode: 'daily' | 'free'): Promise<number[]> {
  await page.waitForFunction((m) => !!JSON.parse(localStorage.getItem('artslide:save') ?? '{}').inProgress?.[m], mode);
  return (await readArt(page)).inProgress[mode].puzzle.solution;
}
async function solve(page: Page, mode: 'daily' | 'free') {
  for (const cell of await solution(page, mode)) {
    const before = Number(await page.getByTestId('moves').innerText());
    await page.locator(`.atile[data-cell="${cell}"]`).click();
    await expect(page.getByTestId('moves')).toHaveText(String(before + 1));
  }
}
const tiles = (page: Page) => page.locator('.aboard .apiece:not(.ghost)');

test('landing card, home navigation and URLs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-art')).toBeVisible();
  await page.getByTestId('landing-art').click();
  await expect(page).toHaveURL(/\/art-slide$/);
  await page.getByTestId('all-games').click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/art-slide$/);
  await page.getByTestId('art-gallery').click();
  await expect(page).toHaveURL(/\/art-slide\/gallery$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/art-slide$/);
  await expect(page.getByTestId('more-word-slide')).toBeVisible();
  await page.goto('/art-slide/gallery'); // direct URL
  await expect(page.getByTestId('gallery')).toBeVisible();
});

test('ART SLIDE home: exhibit with today\'s painting that slides by itself', async ({ page }) => {
  await page.goto('/art-slide');
  await expect(page.locator('.gold-frame')).toBeVisible();
  await expect(page.getByTestId('plaque')).toContainText("TODAY'S EXHIBIT");
  await expect(page.locator('.hero-board .apiece:not(.ghost)')).toHaveCount(8);
  const snap = () => page.locator('.hero-board .atile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join());
  const first = await snap();
  await expect.poll(snap, { timeout: 8000 }).not.toBe(first); // the demo keeps moving tiles
  await expect(page.getByTestId('art-daily')).toBeVisible();
});

test('gallery shows 15+ paintings with title, artist, year and lazy thumbnails', async ({ page }) => {
  await page.goto('/art-slide/gallery');
  const cards = page.locator('.gcard');
  expect(await cards.count()).toBeGreaterThanOrEqual(15);
  await expect(cards.first().locator('img')).toHaveAttribute('loading', 'lazy');
  await expect(cards.first().locator('.g-title')).not.toBeEmpty();
  await expect(cards.first().locator('.g-meta')).toContainText('·');
  await cards.first().click();
  await expect(page).toHaveURL(/\/art-slide\/play\/[a-z0-9-]+$/);
});

test('3x3 default: 8 tiles, art info with credit links, solve, painting completes, result shown', async ({ page }) => {
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await expect(tiles(page)).toHaveCount(8);
  await expect(page.getByTestId('asize-3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('art-title')).toHaveText('The Bedroom');
  await expect(page.locator('.art-credit a').first()).toHaveAttribute('href', /creativecommons\.org/);
  await expect(page.locator('.art-credit a').nth(1)).toHaveAttribute('href', /artic\.edu\/artworks\/28560/);
  await solve(page, 'free');
  await expect(page.locator('.aboard.complete')).toBeVisible();
  await expect(page.locator('.apiece.ghost')).toHaveCSS('opacity', '1', { timeout: 5000 }); // missing piece appears
  await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
  await expect(page.locator('.clear-title')).toHaveText('COMPLETE!');
  await expect(page.getByRole('button', { name: 'PLAY AGAIN' })).toBeVisible();
  const save = await readArt(page);
  expect(save.completed).toBe(1);
  expect(save.bests['3'].moves).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.atile').first()).toBeDisabled(); // locked after clearing
});

for (const [n, count] of [[4, 15], [5, 24]] as const) {
  test(`${n}x${n}: ${count} tiles and a working solution`, async ({ page }) => {
    await page.goto('/art-slide/play/monet-water-lilies');
    await page.getByTestId(`asize-${n}`).click();
    await expect(tiles(page)).toHaveCount(count);
    await solve(page, 'free');
    await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
  });
}

test('changing size after moves asks first; NEW PUZZLE and RESTART behave', async ({ page }) => {
  await page.goto('/art-slide/play/seurat-grande-jatte');
  const sol = await solution(page, 'free');
  const before = await page.locator('.atile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join());
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await expect(page.getByTestId('moves')).toHaveText('1');
  await page.getByTestId('asize-4').click();
  await expect(page.getByRole('alert')).toContainText('4×4');
  await expect(tiles(page)).toHaveCount(8); // not switched yet
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'RESTART' }).click();
  await expect(page.getByTestId('moves')).toHaveText('0');
  const after = await page.locator('.atile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join());
  expect(after).toBe(before); // same arrangement as the start
  await page.getByRole('button', { name: 'NEW PUZZLE' }).click();
  const fresh = await page.locator('.atile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join());
  expect(fresh).not.toBe(before);
  await page.getByTestId('asize-5').click(); // no moves yet: switches immediately
  await expect(tiles(page)).toHaveCount(24);
});

test('preview shows the whole painting and pauses the board', async ({ page }) => {
  await page.goto('/art-slide/play/hokusai-great-wave');
  await page.getByTestId('preview').click();
  const dlg = page.getByRole('dialog', { name: 'Artwork preview' });
  await expect(dlg).toBeVisible();
  const img = dlg.locator('img');
  await expect(img).toHaveAttribute('alt', /Great Wave/);
  // never stretched: the image is letterboxed (object-fit: contain), not squeezed into its box
  await expect(img).toHaveCSS('object-fit', 'contain');
  const [nw, nh] = await img.evaluate((e: HTMLImageElement) => [e.naturalWidth, e.naturalHeight]);
  expect(nw / nh).toBeGreaterThan(1.3); // the wave print is landscape, and is shown whole
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('moves')).toHaveText('0'); // game stopped during preview
  await page.getByTestId('preview-close').click();
  await expect(dlg).toHaveCount(0);
  const sol = await solution(page, 'free');
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await expect(page.getByTestId('moves')).toHaveText('1');
});

test('slicing is seamless in the browser for landscape and portrait works', async ({ page }) => {
  for (const id of ['hokusai-great-wave', 'sargent-madame-x', 'monet-water-lilies']) {
    await page.goto(`/art-slide/play/${id}`);
    await page.getByTestId('asize-4').click();
    await expect(tiles(page)).toHaveCount(15);
    await solve(page, 'free');
    await expect(page.locator('.apiece.ghost')).toHaveCSS('opacity', '1', { timeout: 5000 });
    await page.waitForTimeout(700); // gaps have closed
    // every tile (incl. the revealed one) must imply the SAME image origin and scale
    const implied = await page.locator('.aboard .atile').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        const [sw, sh] = cs.backgroundSize.split(' ').map(parseFloat);
        const [px, py] = cs.backgroundPosition.split(' ').map(parseFloat);
        const W = (r.width * sw) / 100 || sw; // computed values are px in Chromium
        const H = (r.height * sh) / 100 || sh;
        const isPx = cs.backgroundSize.includes('px');
        const Wp = isPx ? sw : W;
        const Hp = isPx ? sh : H;
        const offX = isPx ? px : ((r.width - Wp) * px) / 100;
        const offY = isPx ? py : ((r.height - Hp) * py) / 100;
        return { ox: r.left + offX, oy: r.top + offY, w: Wp, h: Hp };
      }),
    );
    expect(implied).toHaveLength(16);
    for (const t of implied) {
      expect(Math.abs(t.ox - implied[0].ox)).toBeLessThan(1);
      expect(Math.abs(t.oy - implied[0].oy)).toBeLessThan(1);
      expect(Math.abs(t.w - implied[0].w)).toBeLessThan(1);
    }
    // aspect ratio preserved: scaled image ratio = natural ratio
    const nat = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return img.naturalWidth / img.naturalHeight;
    }, `/artworks/${id}.webp`);
    expect(Math.abs(implied[0].w / implied[0].h - nat)).toBeLessThan(0.01);
  }
});

test('image load failure shows an error with retry and a way out', async ({ page }) => {
  await page.route('**/artworks/seurat-grande-jatte.webp', (r) => r.abort());
  await page.goto('/art-slide/play/seurat-grande-jatte');
  await expect(page.getByTestId('art-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.unroute('**/artworks/seurat-grande-jatte.webp');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('art-error')).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(8);
});

test('progress survives a reload', async ({ page }) => {
  await page.goto('/art-slide/play/cezanne-basket-of-apples');
  const sol = await solution(page, 'free');
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await page.locator(`.atile[data-cell="${sol[1]}"]`).click();
  const snap = () => page.locator('.atile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join());
  const before = await snap();
  await page.reload();
  await expect(page.getByTestId('moves')).toHaveText('2');
  expect(await snap()).toBe(before);
  await page.goto('/art-slide');
  await expect(page.getByTestId('art-resume')).toBeVisible();
});

test('daily: 4x4, one painting for everyone, no size switch, records the clear', async ({ page, browser }) => {
  await page.goto('/art-slide/daily');
  await expect(tiles(page)).toHaveCount(15);
  await expect(page.getByTestId('asize-3')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'NEW PUZZLE' })).toHaveCount(0);
  const title = await page.getByTestId('art-title').innerText();
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/art-slide/daily');
  await expect(p2.getByTestId('art-title')).toHaveText(title);
  const snap = (p: Page) => p.locator('.atile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join());
  expect(await snap(p2)).toBe(await snap(page));
  await ctx.close();
  await solve(page, 'daily');
  await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
  expect(Object.keys((await readArt(page)).dailyHistory)).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'PLAY AGAIN' })).toHaveCount(0);
});

test('credits list every painting with licence and source; other games untouched', async ({ page }) => {
  await page.goto('/art-slide/credits');
  const items = page.getByTestId('credits').locator('li');
  expect(await items.count()).toBeGreaterThanOrEqual(15);
  await expect(items.first().locator('a')).toHaveCount(2);
  await page.goto('/word-slide/daily');
  await expect(page.locator('.tile')).toHaveCount(15);
  expect(await page.evaluate(() => localStorage.getItem('wordslide:save') ?? '')).not.toContain('artslide');
});

test('puzzle is the main thing: big board; on desktop the info sits beside it', async ({ page }, info) => {
  await page.goto('/art-slide/play/renoir-two-sisters');
  await page.getByTestId('asize-5').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  const board = (await page.locator('.aboard').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(board.x + board.width).toBeLessThanOrEqual(vp.width);
  if (info.project.name === 'desktop') {
    expect(board.width).toBeGreaterThan(500); // large on PC
    const side = (await page.locator('.art-info').boundingBox())!;
    const size = (await page.getByTestId('asize-3').boundingBox())!;
    const stats = (await page.getByTestId('time').boundingBox())!;
    expect(side.x).toBeGreaterThanOrEqual(board.x + board.width); // description beside the board
    expect(size.x).toBeGreaterThanOrEqual(board.x + board.width); // size choice beside the board
    expect(stats.x).toBeGreaterThanOrEqual(board.x + board.width);
    expect(board.y + board.height).toBeLessThanOrEqual(vp.height); // whole board visible without scrolling
  } else {
    expect(board.width).toBeGreaterThan(vp.width * 0.85); // fills the phone width
  }
});

test('dark theme keeps the art UI readable', async ({ page }) => {
  await page.goto('/settings');
  await page.locator('select').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/art-slide');
  await expect(page.locator('.gold-frame')).toBeVisible();
  await page.goto('/art-slide/play/degas-dance-class');
  await expect(tiles(page)).toHaveCount(8);
});
