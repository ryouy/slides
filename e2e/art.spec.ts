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

const CLEARED = /CLEARED!|COMPLETE!/;
const readArt = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('artslide:save') ?? '{}'));
async function savedPuzzle(page: Page, mode: 'daily' | 'free') {
  await page.waitForFunction((m) => !!JSON.parse(localStorage.getItem('artslide:save') ?? '{}').inProgress?.[m], mode);
  return (await readArt(page)).inProgress[mode].puzzle as { solution: number[]; cols: number; rows: number; size: number };
}
const solution = async (page: Page, mode: 'daily' | 'free') => (await savedPuzzle(page, mode)).solution;
async function solve(page: Page, mode: 'daily' | 'free') {
  for (const cell of await solution(page, mode)) {
    const before = Number(await page.getByTestId('moves').innerText());
    await page.locator(`.atile[data-cell="${cell}"]`).click();
    await expect(page.getByTestId('moves')).toHaveText(String(before + 1));
  }
}
/** SHUFFLE glides the tiles one by one (about 3 s); wait until it has finished and been saved. */
async function shuffleDone(page: Page) {
  await expect(page.locator('.aboard')).not.toHaveClass(/shuffling/, { timeout: 12000 });
  await page.waitForFunction(() => {
    const st = JSON.parse(localStorage.getItem('artslide:save') ?? '{}').inProgress?.free;
    if (!st) return false;
    const dom = [...document.querySelectorAll('.atile')].filter((e) => e.getAttribute('data-cell') !== '').map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).sort().join();
    const saved = st.board.map((t: number | null, c: number) => (t === null ? '' : `${t}@${c}`)).filter(Boolean).sort().join();
    return dom === saved && st.status === 'playing' && st.moves === 0;
  });
}
const tiles = (page: Page) => page.locator('.aboard .apiece:not(.ghost)');
const snap = (page: Page) => page.locator('.atile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join());

test('ART SLIDE is the main page (/ and /art-slide), plain and not Wordle-like, with no daily button duplicating the exhibit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.art-home-title')).toHaveText('ART SLIDE');
  await expect(page.locator('.art-theme')).toBeVisible();
  await expect(page.locator('.logo-tile')).toHaveCount(0); // no green/yellow/gray letter tiles
  await expect(page.getByTestId('art-daily')).toHaveCount(0); // the exhibit card IS the daily puzzle
  await expect(page.getByTestId('exhibit')).toContainText("TODAY'S EXHIBIT");
  await expect(page.locator('.tagline, .art-sub, .menu small')).toHaveCount(0); // no explanatory small print
  await page.getByTestId('art-gallery').click();
  await expect(page).toHaveURL(/\/art-slide\/gallery$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/art-slide$/);
  await expect(page.getByTestId('more-big')).toBeVisible();
  await expect(page.getByTestId('more-word')).toBeVisible();
  await page.goto('/art-slide/gallery'); // direct URL
  await expect(page.getByTestId('gallery')).toBeVisible();
});

test('the exhibit card leads straight to today\'s puzzle; four quiet links', async ({ page }) => {
  await page.goto('/art-slide');
  await expect(page.locator('.home-links button')).toHaveCount(4);
  await page.getByTestId('exhibit').click();
  await expect(page).toHaveURL(/\/art-slide\/daily$/);
});

test('gallery shows 100+ paintings with title, artist, year and lazy thumbnails', async ({ page }) => {
  await page.goto('/art-slide/gallery');
  const cards = page.locator('.gcard');
  expect(await cards.count()).toBeGreaterThanOrEqual(100);
  await expect(cards.first().locator('img')).toHaveAttribute('loading', 'lazy');
  await expect(cards.first().locator('.g-title')).not.toBeEmpty();
  await expect(cards.first().locator('.g-meta')).toContainText('·');
  await cards.first().click();
  await expect(page).toHaveURL(/\/art-slide\/play\/[a-z0-9-]+$/);
});

test('gallery: search, group by theme/artist/era, sort, and the choice is remembered', async ({ page }) => {
  await page.goto('/art-slide/gallery');
  const total = await page.locator('.gcard').count();
  await expect(page.locator('.gal-h').first()).toContainText(/landscape/i); // default: grouped by theme
  expect(await page.locator('.gal-group').count()).toBeGreaterThanOrEqual(6);
  await page.getByTestId('gal-search').fill('monet');
  const monet = await page.locator('.gcard').count();
  expect(monet).toBeGreaterThanOrEqual(3);
  expect(monet).toBeLessThan(total);
  await expect(page.getByTestId('gal-count')).toContainText(`${monet} of`);
  for (const meta of await page.locator('.g-meta').allInnerTexts()) expect(meta).toContain('Monet');
  await page.getByTestId('gal-search').fill('zzzz nothing');
  await expect(page.locator('.gal-empty')).toBeVisible();
  await page.getByTestId('gal-search').fill('');
  await expect(page.getByTestId('gal-count')).toHaveCount(0); // the count only shows while filtering
  await page.getByTestId('group-by').selectOption('artist');
  expect(await page.locator('.gal-h').count()).toBeGreaterThanOrEqual(40);
  await page.getByTestId('group-by').selectOption('era');
  const heads = await page.locator('.gal-h').allInnerTexts();
  expect(heads[0]).toMatch(/before 1700/i);
  expect(heads[heads.length - 1]).toMatch(/1900s/i);
  await page.getByTestId('group-by').selectOption('none');
  await page.getByTestId('sort-by').selectOption('year-asc');
  expect(await page.locator('.gal-h').count()).toBe(0);
  const years = (await page.locator('.g-meta').allInnerTexts()).map((t) => Number((t.match(/(\d{4})/) ?? [])[1])).filter(Boolean);
  expect(years[0]).toBeLessThanOrEqual(1700);
  expect(years[years.length - 1]).toBeGreaterThanOrEqual(1893);
  await page.reload();
  await expect(page.getByTestId('group-by')).toHaveValue('none');
  await expect(page.getByTestId('sort-by')).toHaveValue('year-asc');
});

test('easy level: caption bar, whole-painting board, solve, painting completes, result shown', async ({ page }) => {
  await page.goto('/art-slide/play/van-gogh-bedroom');
  const d = await savedPuzzle(page, 'free');
  await expect(tiles(page)).toHaveCount(d.cols * d.rows - 1);
  await expect(page.getByTestId('asize-3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('art-title')).toHaveText('The Bedroom');
  await expect(page.locator('.top-sub')).toContainText('Vincent van Gogh');
  // the description is simply shown (nothing to unfold), with a quiet credit line
  await expect(page.getByTestId('art-desc')).toBeVisible();
  await expect(page.getByTestId('art-desc')).not.toBeEmpty();
  await expect(page.locator('.ap-credit a').first()).toHaveAttribute('href', /creativecommons\.org/);
  await expect(page.locator('.ap-credit a').nth(1)).toHaveAttribute('href', /artic\.edu\/artworks\/28560/);
  await solve(page, 'free');
  await expect(page.locator('.aboard.complete')).toBeVisible();
  await expect(page.locator('.apiece.ghost')).toHaveCSS('opacity', '1', { timeout: 6000 });
  await expect(page.getByRole('dialog', { name: CLEARED })).toBeVisible();
  await expect(page.locator('.clear-title')).toHaveText('COMPLETE!');
  await expect(page.getByRole('button', { name: /play again/i })).toBeVisible();
  const save = await readArt(page);
  expect(save.completed).toBe(1);
  expect(save.bests['3'].moves).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.atile').first()).toBeDisabled();
});

for (const level of [4, 5]) {
  test(`level ${level}: more pieces than the easier level, and a working solution`, async ({ page }) => {
    await page.goto('/art-slide/play/monet-water-lilies');
    const easy = await savedPuzzle(page, 'free');
    await page.getByTestId(`asize-${level}`).click();
    await expect.poll(async () => (await savedPuzzle(page, 'free')).size).toBe(level);
    const d = await savedPuzzle(page, 'free');
    expect(d.cols * d.rows).toBeGreaterThan(easy.cols * easy.rows);
    await expect(tiles(page)).toHaveCount(d.cols * d.rows - 1);
    await solve(page, 'free');
    await expect(page.getByRole('dialog', { name: CLEARED })).toBeVisible();
  });
}

test('the grid follows the painting: wide paintings get more columns, tall ones more rows, and the board has the painting\'s own shape', async ({ page }) => {
  for (const [id, wide] of [['hokusai-great-wave', true], ['sargent-madame-x', false]] as const) {
    await page.goto(`/art-slide/play/${id}`);
    await page.getByTestId('asize-4').click();
    await expect.poll(async () => (await savedPuzzle(page, 'free')).size).toBe(4);
    const d = await savedPuzzle(page, 'free');
    if (wide) expect(d.cols).toBeGreaterThan(d.rows);
    else expect(d.rows).toBeGreaterThan(d.cols);
    await expect(tiles(page)).toHaveCount(d.cols * d.rows - 1);
    const [nw, nh] = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, `/artworks/${id}.webp`);
    const box = (await page.locator('.aboard').boundingBox())!;
    expect(Math.abs(box.width / box.height - nw / nh)).toBeLessThan(0.03); // nothing is cropped or stretched
  }
});

test('changing level after moves asks first; SHUFFLE and RESTART behave', async ({ page }) => {
  await page.goto('/art-slide/play/seurat-grande-jatte');
  const sol = await solution(page, 'free');
  const before = await snap(page);
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await expect(page.getByTestId('moves')).toHaveText('1');
  await page.getByTestId('asize-4').click();
  await expect(page.getByRole('alert')).toContainText(/Switch to \d+×\d+/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('restart').click();
  await expect(page.getByTestId('moves')).toHaveText('0');
  expect(await snap(page)).toBe(before); // same arrangement as the start
  await page.getByTestId('shuffle').click();
  await shuffleDone(page);
  expect(await snap(page)).not.toBe(before);
  await page.getByTestId('asize-5').click(); // no moves yet: switches immediately
  await expect.poll(async () => (await savedPuzzle(page, 'free')).size).toBe(5);
});

test('SHUFFLE really slides the tiles one by one, asks first once you have moved, and always stays solvable', async ({ page }) => {
  await page.goto('/art-slide/play/monet-water-lilies');
  const first = await snap(page);
  const dur = await page.locator('.apiece').first().evaluate((e) => getComputedStyle(e).transitionDuration);
  expect(parseFloat(dur)).toBeGreaterThan(0.1); // tiles glide, they do not jump
  await page.getByTestId('shuffle').click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.aboard')).toHaveClass(/shuffling/);
  const seen = new Set<string>();
  const t0 = Date.now();
  let sawDisabled = false;
  while (Date.now() - t0 < 12000) {
    const st = await page.evaluate(() => ({ s: !!document.querySelector('.aboard.shuffling'), d: (document.querySelector('[data-testid=shuffle]') as HTMLButtonElement).disabled, b: [...document.querySelectorAll('.atile')].map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join() }));
    if (!st.s) break;
    seen.add(st.b);
    expect(st.d).toBe(true);
    sawDisabled = true;
    await page.waitForTimeout(40);
  }
  expect(sawDisabled).toBe(true);
  expect(seen.size).toBeGreaterThanOrEqual(8);
  await shuffleDone(page);
  await expect(page.getByTestId('moves')).toHaveText('0');
  expect(await snap(page)).not.toBe(first);
  const sol = await solution(page, 'free');
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await expect(page.getByTestId('moves')).toHaveText('1');
  const mid = await snap(page);
  await page.getByTestId('shuffle').click();
  await expect(page.getByRole('alert')).toContainText(/Shuffle again/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await snap(page)).toBe(mid);
  await page.getByTestId('shuffle').click();
  await page.getByTestId('confirm-shuffle').click();
  await shuffleDone(page);
  expect(await snap(page)).not.toBe(mid);
  await solve(page, 'free');
  await expect(page.getByRole('dialog', { name: CLEARED })).toBeVisible();
});

test('tiles cannot be moved while shuffling; PLAY AGAIN after finishing slides the painting apart again', async ({ page }) => {
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await solve(page, 'free');
  await expect(page.getByRole('dialog', { name: CLEARED })).toBeVisible();
  await page.getByRole('button', { name: /play again/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.aboard')).toHaveClass(/shuffling/);
  await expect(page.locator('.atile').first()).toBeDisabled();
  await shuffleDone(page);
  await expect(page.locator('.aboard.complete')).toHaveCount(0);
  await expect(page.getByTestId('moves')).toHaveText('0');
  await solve(page, 'free');
  await expect(page.getByRole('dialog', { name: CLEARED })).toBeVisible();
  expect((await readArt(page)).completed).toBe(2);
});

test('with reduced motion the shuffle is applied at once (no sliding sequence)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/art-slide/play/degas-dance-class');
  const first = await snap(page);
  await page.getByTestId('shuffle').click();
  await expect.poll(() => snap(page)).not.toBe(first);
  await expect(page.locator('.aboard.shuffling')).toHaveCount(0);
});

test('pages glide in: forward from the right, back from the left', async ({ page }) => {
  await page.goto('/art-slide');
  await page.getByTestId('art-gallery').click();
  await expect(page).toHaveURL(/\/art-slide\/gallery$/);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-nav'))).toBe('forward');
  expect(await page.locator('.page-enter').evaluate((e) => getComputedStyle(e).animationName)).toBe('pageIn');
  await page.goBack();
  await expect(page).toHaveURL(/\/art-slide$/);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-nav'))).toBe('back');
  expect(await page.locator('.page-enter').evaluate((e) => getComputedStyle(e).animationName)).toBe('pageInBack');
  await page.getByTestId('art-gallery').click();
  await page.locator('.gcard').first().click();
  await page.waitForTimeout(500);
  await page.getByTestId('preview').click();
  const box = await page.getByRole('dialog', { name: 'Preview' }).boundingBox();
  expect(box!.width).toBeGreaterThan(page.viewportSize()!.width - 2); // the overlay covers the viewport
});

test('preview lies over the real puzzle a little larger, with tiny credits, and fades out smoothly', async ({ page }) => {
  await page.goto('/art-slide/play/hokusai-great-wave');
  await page.waitForTimeout(450);
  const board = (await page.locator('.aboard').boundingBox())!;
  await page.getByTestId('preview').click();
  const layer = page.getByRole('dialog', { name: 'Preview' });
  await expect(layer).toBeVisible();
  await page.waitForTimeout(450);
  const card = (await page.getByTestId('preview-card').boundingBox())!;
  const vp = page.viewportSize()!;
  // right on top of the board, centred on it, a bit larger (never beyond the screen)
  expect(card.x).toBeLessThanOrEqual(board.x + 1);
  expect(card.y).toBeLessThanOrEqual(board.y + 1);
  expect(card.x + card.width).toBeGreaterThanOrEqual(board.x + board.width - 1);
  expect(card.y + card.height).toBeGreaterThanOrEqual(board.y + board.height - 1);
  expect(card.width).toBeGreaterThan(board.width + 4);
  expect(card.width).toBeLessThanOrEqual(board.width * 1.09);
  expect(Math.abs(card.x + card.width / 2 - (board.x + board.width / 2))).toBeLessThan(2);
  expect(card.x).toBeGreaterThanOrEqual(-0.5);
  expect(card.x + card.width).toBeLessThanOrEqual(vp.width + 0.5);
  // the picture is whole, not stretched, and its credits are small
  const img = layer.locator('img');
  await expect(img).toHaveAttribute('alt', /Great Wave/);
  await expect(img).toHaveCSS('object-fit', 'contain');
  const [nw, nh] = await img.evaluate((e: HTMLImageElement) => [e.naturalWidth, e.naturalHeight]);
  expect(Math.abs(card.width / card.height - nw / nh)).toBeLessThan(0.03);
  expect(await layer.locator('.pv-title').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(12);
  expect(await layer.locator('.pv-credit').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(10.5);
  await expect(layer.locator('.pv-credit')).toContainText('CC0');
  // the game is paused underneath
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('moves')).toHaveText('0');
  // tapping outside eases it away (opacity passes through in-between values) instead of vanishing at once
  const opacities = await page.evaluate(
    () =>
      new Promise<number[]>((res) => {
        const vals: number[] = [];
        const layerEl = document.querySelector('[data-testid=preview-layer]') as HTMLElement;
        const t0 = performance.now();
        layerEl.click();
        const tick = () => {
          const el = document.querySelector('[data-testid=preview-layer]');
          vals.push(el ? +getComputedStyle(el).opacity : 0);
          if (performance.now() - t0 < 520) requestAnimationFrame(tick);
          else res(vals);
        };
        tick();
      }),
  );
  expect(opacities.length).toBeGreaterThan(12);
  expect(opacities.some((o) => o > 0.08 && o < 0.92)).toBe(true); // a fade, not a cut
  expect(opacities[opacities.length - 1]).toBe(0);
  await expect(layer).toHaveCount(0);
  // closing also works with Escape, and the board is playable afterwards
  await page.getByTestId('preview').click();
  await expect(layer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('preview-layer')).toHaveAttribute('data-state', 'closing');
  await expect(layer).toHaveCount(0);
  const sol = await solution(page, 'free');
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await expect(page.getByTestId('moves')).toHaveText('1');
});

test('the home and the gallery are about visiting a gallery, with a random-painting button in both', async ({ page }) => {
  await page.goto('/art-slide');
  await expect(page.getByTestId('art-gallery')).toHaveText('Visit the gallery');
  await expect(page.getByTestId('art-random')).toHaveText('Random painting');
  await page.getByTestId('art-gallery').click();
  await expect(page.locator('.topbar h1')).toHaveText('GALLERY');
  await expect(page.getByTestId('gal-random')).toBeVisible();
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await page.getByTestId('gal-random').click();
    await expect(page).toHaveURL(/\/art-slide\/play\/[a-z0-9-]+$/);
    const id = page.url().split('/').pop()!;
    seen.add(id);
    await expect(page.locator('.atile').first()).toBeVisible();
    await page.getByTestId('change-artwork').click(); // back to the gallery
    await expect(page).toHaveURL(/\/art-slide\/gallery$/);
  }
  expect(seen.size).toBeGreaterThanOrEqual(2); // it really varies
  await page.goto('/art-slide');
  await page.getByTestId('art-random').click();
  await expect(page).toHaveURL(/\/art-slide\/play\/[a-z0-9-]+$/);
  await expect(page.getByTestId('art-title')).not.toBeEmpty();
});

test('slicing is seamless and uncropped in the browser for landscape and portrait works', async ({ page }) => {
  for (const id of ['hokusai-great-wave', 'sargent-madame-x', 'monet-water-lilies']) {
    await page.goto(`/art-slide/play/${id}`);
    await page.getByTestId('asize-4').click();
    await expect.poll(async () => (await savedPuzzle(page, 'free')).size).toBe(4);
    const d = await savedPuzzle(page, 'free');
    await expect(tiles(page)).toHaveCount(d.cols * d.rows - 1);
    await solve(page, 'free');
    await expect(page.locator('.apiece.ghost')).toHaveCSS('opacity', '1', { timeout: 6000 });
    await page.waitForTimeout(700); // gaps have closed
    const board = (await page.locator('.aboard').boundingBox())!;
    const implied = await page.locator('.aboard .atile').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        const [sw, sh] = cs.backgroundSize.split(' ').map(parseFloat);
        const [px, py] = cs.backgroundPosition.split(' ').map(parseFloat);
        const isPx = cs.backgroundSize.includes('px');
        const Wp = isPx ? sw : (r.width * sw) / 100;
        const Hp = isPx ? sh : (r.height * sh) / 100;
        const offX = isPx ? px : ((r.width - Wp) * px) / 100;
        const offY = isPx ? py : ((r.height - Hp) * py) / 100;
        return { ox: r.left + offX, oy: r.top + offY, w: Wp, h: Hp };
      }),
    );
    expect(implied).toHaveLength(d.cols * d.rows);
    for (const t of implied) {
      expect(Math.abs(t.ox - implied[0].ox)).toBeLessThan(1); // every tile points at the same image placement
      expect(Math.abs(t.oy - implied[0].oy)).toBeLessThan(1);
    }
    // ... and that placement is exactly the board: the whole painting is shown, nothing cropped
    expect(Math.abs(implied[0].ox - board.x)).toBeLessThan(1.5);
    expect(Math.abs(implied[0].oy - board.y)).toBeLessThan(1.5);
    expect(Math.abs(implied[0].w - board.width)).toBeLessThan(1.5);
    expect(Math.abs(implied[0].h - board.height)).toBeLessThan(1.5);
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
  await expect(tiles(page).first()).toBeVisible();
});

test('progress survives a reload', async ({ page }) => {
  await page.goto('/art-slide/play/cezanne-basket-of-apples');
  const sol = await solution(page, 'free');
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await page.locator(`.atile[data-cell="${sol[1]}"]`).click();
  const before = await snap(page);
  await page.reload();
  await expect(page.getByTestId('moves')).toHaveText('2');
  expect(await snap(page)).toBe(before);
  await page.goto('/art-slide');
  await expect(page.getByTestId('art-resume')).toBeVisible();
});

test('daily: normal level, one painting for everyone, no level switch or shuffle, records the clear', async ({ page, browser }) => {
  await page.goto('/art-slide/daily');
  const d = await savedPuzzle(page, 'daily');
  expect(d.size).toBe(4);
  await expect(tiles(page)).toHaveCount(d.cols * d.rows - 1);
  await expect(page.getByTestId('asize-3')).toHaveCount(0);
  await expect(page.getByTestId('shuffle')).toHaveCount(0);
  await expect(page.locator('.top-kicker')).toContainText('DAILY');
  const title = await page.getByTestId('art-title').innerText();
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/art-slide/daily');
  await expect(p2.getByTestId('art-title')).toHaveText(title);
  expect(await snap(p2)).toBe(await snap(page));
  await ctx.close();
  await solve(page, 'daily');
  await expect(page.getByRole('dialog', { name: CLEARED })).toBeVisible();
  expect(Object.keys((await readArt(page)).dailyHistory)).toHaveLength(1);
  await expect(page.getByRole('button', { name: /play again/i })).toHaveCount(0);
});

test('sharing: the result is worked into the text, with a preview link and ready-made buttons', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await solve(page, 'free');
  await expect(page.getByRole('dialog', { name: CLEARED })).toBeVisible();
  await page.getByTestId('share-toggle').click();
  const text = await page.getByTestId('share-text').innerText();
  const moves = await page.locator('.modal .stat-value').nth(1).innerText();
  expect(text).toContain('The Bedroom');
  expect(text).toContain('Vincent van Gogh');
  expect(text).toContain(`${moves} moves`);
  expect(text).toMatch(/\d:\d\d/);
  expect(text).toMatch(/\/s\/van-gogh-bedroom\/$/m); // the link whose preview is the painting as a puzzle
  const x = new URL((await page.getByTestId('share-x').getAttribute('href'))!);
  expect(x.hostname).toMatch(/twitter\.com|x\.com/);
  expect(x.searchParams.get('text')).toContain('The Bedroom');
  expect(x.searchParams.get('url')).toMatch(/\/s\/van-gogh-bedroom\/$/);
  expect(new URL((await page.getByTestId('share-line').getAttribute('href'))!).searchParams.get('url')).toMatch(/\/s\/van-gogh-bedroom\//);
  expect(new URL((await page.getByTestId('share-facebook').getAttribute('href'))!).searchParams.get('u')).toMatch(/\/s\/van-gogh-bedroom\//);
  await page.getByTestId('share-copy').click();
  await expect(page.locator('.share-msg')).toHaveText('Copied!');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('The Bedroom');
  expect(clip).toMatch(/\/s\/van-gogh-bedroom\/$/);
});

test('language: switch in Settings, it applies everywhere and is remembered', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('lang-select')).toHaveValue('en');
  await page.getByTestId('lang-select').selectOption('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('.topbar h1')).toHaveText('設定');
  await page.goto('/art-slide');
  await expect(page.getByTestId('exhibit')).toContainText('本日の展示');
  await expect(page.getByTestId('art-gallery')).toHaveText('ギャラリーを見に行く');
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await expect(page.getByTestId('shuffle')).toHaveText('シャッフル');
  await expect(page.getByTestId('asize-3')).toContainText('やさしい');
  await solve(page, 'free');
  await page.getByTestId('share-toggle').click();
  const text = await page.getByTestId('share-text').innerText();
  expect(text).toContain('「The Bedroom」'); // the shared message is in the player's language
  expect(text).toContain('手で完成させました');
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.goto('/art-slide/gallery');
  await expect(page.getByTestId('gal-search')).toHaveAttribute('placeholder', /検索/);
  await expect(page.locator('.gal-h').first()).toContainText('風景');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  for (const lang of ['zh', 'ko', 'es', 'fr', 'de']) {
    await page.goto('/settings');
    await page.getByTestId('lang-select').selectOption(lang);
    await page.goto('/art-slide');
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByTestId('exhibit')).not.toContainText("TODAY'S EXHIBIT");
  }
});

test('first visit follows the browser language', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'ja-JP' });
  const p = await ctx.newPage();
  await p.goto('/art-slide');
  await expect(p.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(p.getByTestId('art-gallery')).toHaveText('ギャラリーを見に行く');
  await ctx.close();
});

test('credits list every painting with licence and source; other games untouched', async ({ page }) => {
  await page.goto('/art-slide/credits');
  const items = page.getByTestId('credits').locator('li');
  expect(await items.count()).toBeGreaterThanOrEqual(100);
  await expect(items.first().locator('a')).toHaveCount(2);
  await page.goto('/word-slide/daily');
  await expect(page.locator('.tile')).toHaveCount(15);
  expect(await page.evaluate(() => localStorage.getItem('wordslide:save') ?? '')).not.toContain('artslide');
});

test('puzzle first: the board is large; on desktop all controls sit in a tidy column beside it', async ({ page }, info) => {
  await page.goto('/art-slide/play/renoir-two-sisters');
  await page.waitForTimeout(500); // let the page finish gliding in before measuring
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  const board = (await page.locator('.aboard').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(board.x + board.width).toBeLessThanOrEqual(vp.width);
  if (info.project.name === 'desktop') {
    const parts = await Promise.all(['asize-3', 'time', 'moves', 'preview', 'shuffle', 'restart'].map(async (id) => (await page.getByTestId(id).boundingBox())!));
    for (const b of parts) expect(b.x).toBeGreaterThanOrEqual(board.x + board.width); // everything beside the board
    const desc = (await page.getByTestId('art-desc').boundingBox())!;
    expect(desc.x).toBeGreaterThanOrEqual(board.x + board.width);
    expect(board.y + board.height).toBeLessThanOrEqual(vp.height); // the whole board is visible without scrolling
    expect(board.height).toBeGreaterThan(vp.height * 0.7); // and large
    // the side column is aligned: the controls share one left edge
    const lefts = [parts[0].x, parts[3].x, desc.x].map((x) => Math.round(x));
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThan(4);
  } else {
    expect(board.width).toBeGreaterThan(vp.width * 0.8);
  }
});

test('tile numbers and change artwork are quiet options', async ({ page }) => {
  await page.goto('/art-slide/play/degas-dance-class');
  await expect(page.locator('.anum')).toHaveCount(0);
  const toggle = page.getByTestId('numbers-toggle');
  const box = (await toggle.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(16); // a small checkbox, not a big control
  await toggle.check();
  expect(await page.locator('.anum').count()).toBeGreaterThan(3);
  await page.reload();
  await expect(page.getByTestId('numbers-toggle')).toBeChecked(); // remembered
  const size = await page.getByTestId('change-artwork').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(size).toBeLessThanOrEqual(13);
  await page.getByTestId('change-artwork').click();
  await expect(page).toHaveURL(/\/art-slide\/gallery$/);
});

test('dark theme keeps the art UI readable', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('theme-select').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/art-slide');
  await expect(page.getByTestId('exhibit')).toBeVisible();
  await page.goto('/art-slide/play/degas-dance-class');
  await expect(tiles(page).first()).toBeVisible();
});
