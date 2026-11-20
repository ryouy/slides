import { expect, test, type Page } from '@playwright/test';
import { ARTWORKS } from '../src/games/art-slide/data';
import { FREE_ARTWORK_IDS } from '../src/premium/entitlement';

const ARTWORK_COUNT = ARTWORKS.length;

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
/** Like shuffleDone, for the daily (its saved state is under inProgress.daily). */
async function shuffleDailyDone(page: Page) {
  await expect(page.locator('.aboard')).not.toHaveClass(/shuffling/, { timeout: 12000 });
  await page.waitForFunction(() => {
    const st = JSON.parse(localStorage.getItem('artslide:save') ?? '{}').inProgress?.daily;
    if (!st) return false;
    const dom = [...document.querySelectorAll('.atile')].filter((e) => e.getAttribute('data-cell') !== '').map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).sort().join();
    const saved = st.board.map((t: number | null, c: number) => (t === null ? '' : `${t}@${c}`)).filter(Boolean).sort().join();
    return dom === saved && st.status === 'playing' && st.moves === 0;
  });
}
const tiles = (page: Page) => page.locator('.aboard .apiece:not(.ghost)');
const snap = (page: Page) => page.locator('.atile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join());

/** The "More" section of the home page (How to play, Stats, Credits, the other games...) is folded: open it. */
const openMore = async (page: Page) => {
  const d = page.getByTestId('art-more');
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator('summary').click();
};
/** The piece-count menu is a dropdown (levels 3..7 in order); two copies exist (phone / desktop), one is hidden. */
const sizeTrigger = (page: Page) => page.locator('[data-testid=art-size-select]:visible');
const sizeOptions = (page: Page) => page.locator('[data-testid=art-size-select-options]:visible').getByRole('option');
async function setLevel(page: Page, level: number) {
  await sizeTrigger(page).click();
  await sizeOptions(page).nth(level - 3).click();
}
/** The gallery's "Group by" / "Per row" menus are the same kind of dropdown. */
async function chooseSlide(page: Page, testId: string, option: RegExp | string) {
  await page.locator(`[data-testid=${testId}]:visible`).click();
  await page.locator(`[data-testid=${testId}-options]:visible`).getByRole('option', { name: option }).click();
}

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
  await openMore(page);
  await expect(page.getByTestId('more-big')).toBeVisible();
  await expect(page.getByTestId('more-word')).toBeVisible();
  await page.goto('/art-slide/gallery'); // direct URL
  await expect(page.getByTestId('gallery')).toBeVisible();
});

test('the exhibit card leads straight to today\'s puzzle; the quiet links are folded into More', async ({ page }) => {
  await page.goto('/art-slide');
  await expect(page.locator('.art-more-main a').first()).toBeHidden(); // folded until opened
  await openMore(page);
  await expect(page.locator('.art-more-main a')).toHaveCount(3); // how to play, stats, credits (Premium/Account only when the paid plan is on)
  await page.getByTestId('exhibit').click();
  await expect(page).toHaveURL(/\/art-slide\/daily$/);
});

test('gallery shows 100+ paintings with title, artist, year and lazy thumbnails', async ({ page }) => {
  await page.goto('/art-slide/gallery');
  await chooseSlide(page, 'group-by', /No grouping/);
  const cards = page.locator('.gcard');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(100);
  await expect(cards.first().locator('img')).toHaveAttribute('loading', 'lazy');
  await expect(cards.first().locator('.g-title')).not.toBeEmpty();
  await expect(cards.first().locator('.g-meta')).toContainText('·');
  await cards.first().click();
  await expect(page).toHaveURL(/\/art-slide\/play\/[a-z0-9-]+$/);
});

test('gallery: search, group by theme/artist/era shown as tabs, randomised order, and the choice is remembered', async ({ page }) => {
  await page.goto('/art-slide/gallery');
  await expect(page.getByTestId('gal-tabs')).toBeVisible(); // default: grouped by theme, one tab per theme
  await expect(page.locator('[data-testid^="group-tab-"]').first()).toContainText(/landscape|people|portrait|sea/i);
  expect(await page.locator('[data-testid^="group-tab-"]').count()).toBeGreaterThanOrEqual(6);
  const firstTab = await page.locator('[data-testid^="group-tab-"]').first().getAttribute('data-testid');
  await page.locator('[data-testid^="group-tab-"]').nth(1).click();
  await expect(page.locator('[role=tab][aria-selected=true]')).not.toHaveAttribute('data-testid', firstTab!); // another group shows
  // search: counts and results
  await page.getByTestId('gal-search').fill('monet');
  await expect(page.getByTestId('gal-count')).toContainText(' of ');
  const monet = Number(((await page.getByTestId('gal-count').innerText()).match(/^(\d+) of/) ?? [])[1]);
  expect(monet).toBeGreaterThanOrEqual(3);
  await chooseSlide(page, 'group-by', /No grouping/);
  expect(await page.locator('.gcard').count()).toBe(monet);
  for (const meta of await page.locator('.g-meta').allInnerTexts()) expect(meta).toContain('Monet');
  await page.getByTestId('gal-search').fill('zzzz nothing');
  await expect(page.locator('.gal-empty')).toBeVisible();
  await page.getByTestId('gal-search').fill('');
  await expect(page.getByTestId('gal-count')).toHaveCount(0); // the count only shows while filtering
  // there is no grouping by artist; eras come oldest first
  await page.locator('[data-testid=group-by]:visible').click();
  await expect(page.locator('[data-testid=group-by-options]:visible').getByRole('option', { name: /Artist/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await chooseSlide(page, 'group-by', /Era/);
  const heads = await page.locator('[data-testid^="group-tab-"]').allInnerTexts();
  expect(heads[0]).toMatch(/before 1700/i);
  expect(heads[heads.length - 1]).toMatch(/1900s/i);
  // randomised order is a new order, and it is remembered
  await chooseSlide(page, 'group-by', /No grouping/);
  const order = () => page.locator('.gcard').evaluateAll((els) => els.slice(0, 12).map((e) => e.getAttribute('data-testid')).join());
  const before = await order();
  await page.getByTestId('gal-random').click();
  await expect.poll(order).not.toBe(before);
  await expect(page).toHaveURL(/\/art-slide\/gallery$/); // it stays in the gallery
  const shuffled = await order();
  await page.reload();
  await expect(page.locator('[data-testid=group-by]:visible')).toContainText('No grouping');
  expect(await order()).toBe(shuffled);
});

test('easy level: caption bar, whole-painting board, solve, painting completes, result shown', async ({ page }) => {
  await page.goto('/art-slide/play/van-gogh-bedroom');
  const d = await savedPuzzle(page, 'free');
  await expect(tiles(page)).toHaveCount(d.cols * d.rows - 1);
  expect(d.size).toBe(3);
  await expect(sizeTrigger(page)).toContainText(`${d.cols}×${d.rows}`);
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
    await setLevel(page, level);
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
    await setLevel(page, 4);
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

test('changing level after moves asks first; SHUFFLE re-places the pieces', async ({ page }) => {
  await page.goto('/art-slide/play/seurat-grande-jatte');
  const sol = await solution(page, 'free');
  const before = await snap(page);
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await expect(page.getByTestId('moves')).toHaveText('1');
  await setLevel(page, 4);
  await expect(page.getByRole('alert')).toContainText(/Switch to \d+×\d+/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('moves')).toHaveText('1'); // cancelled: nothing changed
  await page.getByTestId('shuffle').click();
  await shuffleDone(page);
  expect(await snap(page)).not.toBe(before);
  await expect(page.getByTestId('restart')).toHaveCount(0); // there is no Restart button any more
  await setLevel(page, 5); // no moves yet: switches immediately
  await expect.poll(async () => (await savedPuzzle(page, 'free')).size).toBe(5);
});

test('SHUFFLE really slides the tiles one by one, never asks for confirmation, and always stays solvable', async ({ page }) => {
  await page.goto('/art-slide/play/monet-water-lilies');
  await expect(page.locator('.art-loading')).toHaveCount(0); // the painting is on the board before we start
  const first = await snap(page);
  const dur = await page.locator('.apiece').first().evaluate((e) => getComputedStyle(e).transitionDuration);
  expect(parseFloat(dur)).toBeGreaterThan(0.1); // tiles glide, they do not jump
  // Record the sliding from INSIDE the page (a MutationObserver sees every step), instead of polling it from the test:
  // polling under a busy machine misses steps and made this test timing-dependent.
  await page.evaluate(() => {
    const w = window as unknown as { __seen: Set<string>; __buttonAlwaysDisabled: boolean; __sawShuffling: boolean };
    w.__seen = new Set(); w.__buttonAlwaysDisabled = true; w.__sawShuffling = false;
    const read = () => [...document.querySelectorAll('.atile')].map((e) => `${e.getAttribute('data-tile')}@${e.getAttribute('data-cell')}`).join();
    const check = () => {
      if (!document.querySelector('.aboard.shuffling')) return;
      w.__sawShuffling = true;
      w.__seen.add(read());
      if (!(document.querySelector('[data-testid=shuffle]') as HTMLButtonElement).disabled) w.__buttonAlwaysDisabled = false;
    };
    new MutationObserver(check).observe(document.body, { subtree: true, attributes: true, childList: true, attributeFilter: ['data-cell', 'class', 'disabled'] });
  });
  await page.getByTestId('shuffle').click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.aboard')).toHaveClass(/shuffling/);
  await shuffleDone(page); // (the observer has recorded the whole sliding by now)
  const rec = await page.evaluate(() => { const w = window as unknown as { __seen: Set<string>; __buttonAlwaysDisabled: boolean; __sawShuffling: boolean }; return { steps: w.__seen.size, disabled: w.__buttonAlwaysDisabled, saw: w.__sawShuffling }; });
  expect(rec.saw).toBe(true);
  expect(rec.disabled).toBe(true); // the button is off for the whole shuffle
  expect(rec.steps).toBeGreaterThanOrEqual(8); // really one tile after another, not a jump
  await expect(page.getByTestId('moves')).toHaveText('0');
  expect(await snap(page)).not.toBe(first);
  const sol = await solution(page, 'free');
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await expect(page.getByTestId('moves')).toHaveText('1');
  const mid = await snap(page);
  await page.getByTestId('shuffle').click(); // even mid-game: no question, it just shuffles
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.aboard')).toHaveClass(/shuffling/);
  await shuffleDone(page);
  await expect(page.getByTestId('moves')).toHaveText('0');
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

test('preview lies over the real puzzle a little larger (a readable sheet on phones), with tiny credits, and fades out smoothly', async ({ page }, info) => {
  await page.goto('/art-slide/play/hokusai-great-wave');
  await page.waitForTimeout(450);
  const board = (await page.locator('.aboard').boundingBox())!;
  await page.getByTestId('preview').click();
  const layer = page.getByRole('dialog', { name: 'Preview' });
  await expect(layer).toBeVisible();
  await page.waitForTimeout(450);
  const card = (await page.getByTestId('preview-card').boundingBox())!;
  const vp = page.viewportSize()!;
  if (info.project.name === 'desktop') {
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
  } else {
    // phones get a readable sheet instead of an overlay on the board: it is simply fully on screen
    expect(card.x).toBeGreaterThanOrEqual(-0.5);
    expect(card.x + card.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(card.width).toBeGreaterThan(vp.width * 0.9);
  }
  // the picture is whole, not stretched, and its credits are small
  const img = layer.locator('img');
  await expect(img).toHaveAttribute('alt', /Great Wave/);
  await expect(img).toHaveCSS('object-fit', 'contain');
  const [nw, nh] = await img.evaluate((e: HTMLImageElement) => [e.naturalWidth, e.naturalHeight]);
  if (info.project.name === 'desktop') expect(Math.abs(card.width / card.height - nw / nh)).toBeLessThan(0.03); // (on phones the sheet also holds the text; object-fit: contain keeps the picture undistorted)
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

test('the home offers the gallery and a random painting; the gallery has its own randomise button', async ({ page }) => {
  await page.goto('/art-slide');
  await expect(page.getByTestId('art-gallery')).toHaveText('Visit the gallery');
  await expect(page.getByTestId('art-random')).toHaveText('Random painting');
  await page.getByTestId('art-gallery').click();
  await expect(page.locator('.topbar h1')).toHaveText('GALLERY');
  await expect(page.getByTestId('gal-random')).toBeVisible(); // reorders the gallery (checked in the gallery test)
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await page.goto('/art-slide');
    await page.getByTestId('art-random').click();
    await expect(page).toHaveURL(/\/art-slide\/play\/[a-z0-9-]+$/);
    seen.add(page.url().split('/').pop()!);
    await expect(page.locator('.atile').first()).toBeVisible();
  }
  expect(seen.size).toBeGreaterThanOrEqual(2); // it really varies
});

test('slicing is seamless and uncropped in the browser for landscape and portrait works', async ({ page }) => {
  for (const id of ['hokusai-great-wave', 'sargent-madame-x', 'monet-water-lilies']) {
    await page.goto(`/art-slide/play/${id}`);
    await setLevel(page, 4);
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

test('daily: normal level, one painting for everyone, no level switch (but a shuffle), records the clear', async ({ page, browser }) => {
  await page.goto('/art-slide/daily');
  const d = await savedPuzzle(page, 'daily');
  expect(d.size).toBe(4);
  await expect(tiles(page)).toHaveCount(d.cols * d.rows - 1);
  await expect(sizeTrigger(page)).toHaveCount(0); // the daily has a fixed size: no menu
  await expect(page.getByTestId('shuffle')).toHaveCount(1); // the daily painting can be shuffled too
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

test('sharing: Share puts the result into the text with a preview link (copied where Web Share does not exist)', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await solve(page, 'free');
  await expect(page.getByRole('dialog', { name: CLEARED })).toBeVisible();
  const moves = await page.locator('.modal .stat-value').nth(1).innerText();
  await page.getByTestId('share-toggle').click();
  await expect(page.locator('.share-msg')).toHaveText('Copied!');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('The Bedroom');
  expect(clip).toContain('Vincent van Gogh');
  expect(clip).toContain(`${moves} moves`);
  expect(clip).toMatch(/\d:\d\d/);
  expect(clip).toMatch(/\/s\/van-gogh-bedroom\/$/m); // the link whose preview is the painting as a puzzle
});

test('language: switch in Settings, it applies everywhere and is remembered', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('lang-select')).toHaveValue('en');
  await page.getByTestId('lang-select').selectOption('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('.topbar h1')).toHaveText('設定');
  await page.goto('/art-slide');
  await expect(page.getByTestId('exhibit')).toContainText('今日の展示');
  await expect(page.getByTestId('art-gallery')).toHaveText('ギャラリー');
  await page.goto('/art-slide/play/van-gogh-bedroom');
  await expect(page.getByTestId('shuffle')).toHaveText('シャッフル');
  await expect(sizeTrigger(page)).toContainText('×');
  await solve(page, 'free');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('share-toggle').click();
  await expect(page.locator('.share-msg')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('The Bedroom'); // the shared message is in the player's language
  expect(text).toContain('手');
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.goto('/art-slide/gallery');
  await expect(page.getByTestId('gal-search')).toHaveAttribute('placeholder', /検索/);
  await expect(page.locator('[data-testid^="group-tab-"]').first()).toBeVisible();
  await expect(page.getByTestId('gal-tabs')).toContainText('風景');
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
  await expect(p.getByTestId('art-gallery')).toHaveText('ギャラリー');
  await ctx.close();
});

test('credits list every painting with licence and source; other games untouched', async ({ page }) => {
  await page.goto('/art-slide/credits');
  const items = page.getByTestId('credits').locator('li');
  expect(await items.count()).toBe(ARTWORK_COUNT);
  const links = await items.first().locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  expect(links.some((h) => /creativecommons\.org/.test(h))).toBe(true); // licence
  expect(links.some((h) => /artic\.edu|metmuseum\.org/.test(h))).toBe(true); // source
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
    const parts = await Promise.all([sizeTrigger(page), page.getByTestId('time-desktop'), page.getByTestId('moves-desktop'), page.getByTestId('preview'), page.getByTestId('shuffle'), page.getByTestId('numbers-toggle')].map(async (l) => (await l.boundingBox())!));
    for (const b of parts) expect(b.x).toBeGreaterThanOrEqual(board.x + board.width); // everything beside the board
    const desc = (await page.getByTestId('art-desc').boundingBox())!;
    expect(desc.x).toBeGreaterThanOrEqual(board.x + board.width);
    expect((await page.getByTestId('numbers-toggle').boundingBox())!.x).toBeGreaterThanOrEqual(board.x + board.width);
    expect(board.y + board.height).toBeLessThanOrEqual(vp.height); // the whole board is visible without scrolling
    expect(board.height).toBeGreaterThan(vp.height * 0.82); // and large: nearly the whole height
    // the side column is aligned: the controls share one left edge
    const lefts = [parts[0].x, desc.x].map((x) => Math.round(x)); // piece count and description share the side column's left edge
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThan(4);
  } else {
    expect(board.width).toBeGreaterThan(vp.width * 0.8);
  }
});

test('tile numbers sits in the button row with Preview and Shuffle, is clearly on/off and is remembered', async ({ page }) => {
  await page.goto('/art-slide/play/degas-dance-class');
  await page.waitForTimeout(450);
  await expect(page.locator('.anum')).toHaveCount(0);
  const toggle = page.getByTestId('numbers-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const [pv, sh, tg] = await Promise.all(['preview', 'shuffle', 'numbers-toggle'].map(async (id) => (await page.getByTestId(id).boundingBox())!));
  expect(Math.abs(tg.y - pv.y)).toBeLessThan(2); // one row: Preview, Shuffle, Numbers
  expect(Math.abs(tg.y - sh.y)).toBeLessThan(2);
  expect(tg.x).toBeGreaterThan(sh.x);
  expect(tg.height).toBeGreaterThanOrEqual(28); // a comfortable button (the desktop side column is compact)
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.anum').count()).toBeGreaterThan(3);
  await expect.poll(() => toggle.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)'); // visibly "on" once the colour has eased in
  await page.reload();
  await expect(page.getByTestId('numbers-toggle')).toHaveAttribute('aria-pressed', 'true'); // remembered
});

test('navigation uses drawn chevrons (back buttons) and no text arrows', async ({ page }) => {
  await page.goto('/art-slide');
  await openMore(page);
  expect(await page.locator('.art-more-puzzles, .art-more-puzzles a').first().innerText()).not.toMatch(/[→←›‹]/); // the way to BIG / WORD: plain links
  await page.getByTestId('more-big').click();
  await expect(page.locator('.all-games svg')).toHaveCount(1); // back to ART SLIDE
  expect(await page.locator('.all-games').innerText()).not.toMatch(/[→←›‹]/);
  await page.goto('/art-slide/gallery');
  await expect(page.locator('.back-btn svg')).toHaveCount(1);
  expect(await page.locator('.back-btn').innerText()).toBe('');
});

test('settings: switches, a segmented theme choice and a styled language select', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('.set-row')).toHaveCount(4); // language, theme, colour-blind, ad cookies (dev)
  const sw = page.locator('.switch-input').first();
  const box = (await sw.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([46, 28]); // a switch, not a tiny checkbox
  await expect(sw).not.toBeChecked();
  await sw.click();
  await expect(sw).toBeChecked();
  await expect(page.getByTestId('theme-system')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('theme-dark').click();
  await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('theme-light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.getByTestId('lang-select').evaluate((e) => getComputedStyle(e).appearance)).toBe('none'); // custom look
  await page.reload();
  await expect(sw).toBeChecked(); // remembered
});

test('dark theme keeps the art UI readable', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('theme-dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/art-slide');
  await expect(page.getByTestId('exhibit')).toBeVisible();
  await page.goto('/art-slide/play/degas-dance-class');
  await expect(tiles(page).first()).toBeVisible();
});

test.describe('Free / Premium gating (dev switch)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('slides:dev-gating', '1'));
  });

  test('gallery marks Premium paintings with a lock; a locked painting opens the offer, not the game', async ({ page }) => {
    await page.goto('/art-slide/gallery');
    await expect(page.locator('a.gcard').first()).toBeVisible();
    const ids = await page.locator('a.gcard').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(4)));
    expect(ids.length).toBeGreaterThan(10);
    // exactly the paintings outside the fixed free list carry a lock
    await expect(page.locator('[data-testid^="lock-"]')).toHaveCount(ids.filter((id) => !FREE_ARTWORK_IDS.includes(id)).length);
    await expect(page.getByTestId('lock-van-gogh-bedroom')).toHaveCount(0); // a free painting
    await page.locator('[data-testid^="lock-"]').first().locator('xpath=..').click();
    await expect(page.getByTestId('premium-reason')).toBeVisible();
    await expect(page.locator('.aboard')).toHaveCount(0);
  });

  test('typing a locked URL directly shows the offer', async ({ page }) => {
    await page.goto('/art-slide/play/monet-stacks-of-wheat-end-of-summer');
    await expect(page.getByTestId('premium')).toBeVisible();
    await expect(page.locator('.aboard')).toHaveCount(0);
    await page.goto('/art-slide/play/van-gogh-bedroom');
    await expect(page.locator('.aboard')).toBeVisible();
  });

  test('boards above level 5 are locked and open the offer', async ({ page }) => {
    await page.goto('/art-slide/play/van-gogh-bedroom');
    await page.locator('[data-testid=art-size-select]:visible').click();
    const opts = page.locator('[data-testid=art-size-select-options]:visible').getByRole('option');
    await expect(opts).toHaveCount(5); // levels 3..7
    for (const i of [0, 1, 2]) await expect(opts.nth(i).getByTestId('size-lock')).toHaveCount(0); // Free: up to level 5
    for (const i of [3, 4]) await expect(opts.nth(i).getByTestId('size-lock')).toHaveCount(1); // levels 6 and 7: Premium
    await opts.last().click();
    await expect(page.getByTestId('premium')).toBeVisible();
  });

  test('Premium (dev flag) opens everything', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('slides:dev-premium', '1'));
    await page.goto('/art-slide/gallery');
    await expect(page.locator('[data-testid^="lock-"]')).toHaveCount(0);
    await page.goto('/art-slide/play/monet-stacks-of-wheat-end-of-summer');
    await expect(page.locator('.aboard')).toBeVisible();
    await page.locator('[data-testid=art-size-select]:visible').click();
    await expect(page.locator('[data-testid=art-size-select-options]:visible').getByRole('option')).toHaveCount(5);
    await expect(page.getByTestId('size-lock')).toHaveCount(0);
  });

  test('the offer shows price, features and renewal terms', async ({ page }) => {
    await page.goto('/art-slide/premium');
    const text = await page.getByTestId('premium').innerText();
    expect(text).toContain('¥200 / month');
    expect(text).toMatch(/\d{3,}\+ more paintings to play/); // the paintings Premium adds to the free ones (collection minus the 75 free), "N+"
    expect(text).toMatch(/No ads/);
    // the renewal terms are shown with the purchase facts, which only appear where a purchase can be made (see legal.spec.ts)
    await expect(page.getByTestId('premium-subscribe')).toHaveCount(0); // no button until the paid plan is live and the server allows this visitor
    await expect(page.getByTestId('premium-soon')).toBeVisible();
  });
});

test.describe('home on wide screens', () => {
  test('desktop: two columns and a row of six paintings fill the page, with no scroll and no overflow', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'wide screens only');
    for (const [w, h] of [[1440, 900], [1366, 768], [1280, 800], [1920, 1080]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/art-slide');
      await page.waitForTimeout(600);
      const strip = page.getByTestId('home-picks');
      await expect(strip).toBeVisible();
      await expect(strip.locator('li:not(.pk-more) a')).toHaveCount(11); // more than fit across: the row scrolls sideways
      await expect(strip.getByTestId('home-picks-more')).toHaveCount(1); // and ends with the way into the gallery
      const m = await page.evaluate(() => ({
        over: document.documentElement.scrollHeight - innerHeight,
        sw: document.documentElement.scrollWidth - innerWidth,
        bottom: document.querySelector('[data-testid=home-picks]')!.getBoundingClientRect().bottom,
        exhibit: document.querySelector('[data-testid=exhibit]')!.getBoundingClientRect().toJSON(),
        menu: document.querySelector('[data-testid=art-gallery]')!.getBoundingClientRect().toJSON(),
      }));
      expect(m.over, `${w}x${h}`).toBeLessThanOrEqual(0);
      expect(m.sw).toBeLessThanOrEqual(0);
      expect(m.bottom).toBeGreaterThan(h * 0.65); // the page is filled, not a thin column in a blank screen
      expect(m.menu.x).toBeGreaterThan(m.exhibit.x + m.exhibit.width); // the buttons sit beside today's exhibit
    }
  });

  test('desktop: More and Settings sit under the paintings row; in a window too short for it, under today\'s exhibit (left) and the two links (right)', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'wide screens only');
    const boxes = () => page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON();
      return { exhibit: r('[data-testid=exhibit]'), gallery: r('[data-testid=art-gallery]'), random: r('[data-testid=art-random]'), strip: r('[data-testid=home-picks]'), more: r('.art-more summary'), settings: r('[data-testid=art-settings]') };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/art-slide');
    await page.waitForTimeout(600);
    const tall = await boxes();
    expect(tall.more.y).toBeGreaterThanOrEqual(tall.strip.y + tall.strip.height - 1); // below the paintings
    expect(tall.settings.y + tall.settings.height).toBeLessThanOrEqual(tall.exhibit.y + 1); // Settings is in the top row beside Sign in / Account
    await page.setViewportSize({ width: 1280, height: 650 });
    await page.waitForTimeout(300);
    await expect(page.getByTestId('home-picks')).toBeHidden();
    const m = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON();
      return { exhibit: r('[data-testid=exhibit]'), random: r('[data-testid=art-random]'), more: r('.art-more summary'), settings: r('[data-testid=art-settings]') };
    });
    expect(m.more.y).toBeGreaterThanOrEqual(m.exhibit.y + m.exhibit.height - 1); // under today's exhibit...
    expect(m.more.x).toBeLessThan(m.exhibit.x + m.exhibit.width / 2); // ...at its left
    expect(m.settings.y + m.settings.height).toBeLessThanOrEqual(m.exhibit.y + 1); // Settings stays in the top row
  });

  test('desktop: the two links are frameless lines of type with a drawn chevron', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'wide screens only');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/art-slide');
    for (const id of ['art-gallery', 'art-random']) {
      const b = page.getByTestId(id);
      await expect(b).toHaveCSS('border-left-width', '0px'); // no box: only hairlines between the lines
      await expect(b).toHaveCSS('border-right-width', '0px');
      await expect(b).toHaveCSS('border-radius', '0px');
      await expect(b.locator('svg.btn-chev')).toBeVisible();
      expect(await b.innerText()).not.toMatch(/[→›>]/); // the arrow is drawn, not a character
    }
    await page.getByTestId('art-gallery').click();
    await expect(page).toHaveURL(/\/art-slide\/gallery$/);
  });

  test('desktop: a picked painting opens its puzzle; the picks are the same all day', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'wide screens only');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/art-slide');
    const ids = () => page.locator('[data-testid^="pick-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    const first = await ids();
    await page.reload();
    expect(await ids()).toEqual(first);
    await page.locator('[data-testid^="pick-"]').first().click();
    await expect(page).toHaveURL(/\/art-slide\/play\/[a-z0-9-]+$/);
    await expect(page.locator('.aboard')).toBeVisible();
  });

  test('phones keep the old home: no strip, and its images are never loaded', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phones only');
    const images: string[] = [];
    page.on('request', (r) => /\/artworks\/.*-thumb\.webp/.test(r.url()) && images.push(r.url()));
    await page.goto('/art-slide');
    await page.waitForTimeout(600);
    await expect(page.getByTestId('home-picks')).toBeHidden();
    expect(images.length).toBeLessThanOrEqual(1); // only today's exhibit
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  test('with the paid plan switched on, Free visitors are only offered paintings they can play', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'wide screens only');
    await page.addInitScript(() => localStorage.setItem('slides:dev-gating', '1'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/art-slide');
    const ids = (await page.locator('[data-testid^="pick-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(5))));
    expect(ids.length).toBe(11); // more than fit across; every one is playable for a Free visitor
    for (const id of ids) expect(FREE_ARTWORK_IDS).toContain(id);
  });
});

test('home menu: the "more" section is called Menu (not "More"), and in Japanese the links use a Gothic face', async ({ page }, info) => {
  await page.goto('/art-slide');
  await expect(page.locator('.art-more summary')).toHaveText('Menu');
  await page.goto('/settings');
  await page.getByTestId('lang-select').selectOption('ja');
  await page.goto('/art-slide');
  await page.waitForTimeout(500);
  await expect(page.locator('.art-more summary')).toHaveText('メニュー');
  for (const id of ['art-gallery', 'art-random']) {
    const family = await page.getByTestId(id).evaluate((e) => getComputedStyle(e).fontFamily);
    expect(family, id).not.toMatch(/Georgia|Times/i); // no serif face (sans-serif is fine)
    expect(family, id).toMatch(/Gothic|Hiragino|Yu Gothic|Noto Sans|Meiryo|sans-serif|Helvetica/i);
  }
  if (info.project.name === 'desktop') {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const id of ['art-gallery', 'art-random']) {
      const family = await page.getByTestId(id).evaluate((e) => getComputedStyle(e).fontFamily);
      expect(family).toMatch(/Hiragino Kaku Gothic|Yu Gothic|Noto Sans JP|Meiryo/);
      expect(family).not.toMatch(/Georgia/);
    }
  }
});

// ---- phones and tablets: roomy controls, and a warning that never shifts the board ----
for (const [w, h] of [[320, 640], [360, 740], [375, 667], [390, 844], [430, 932], [768, 1024], [899, 900], [667, 375]] as const) {
  test(`${w}px wide: the controls sit in the header as icon buttons, Information kept away from Shuffle, no overflow`, async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'touch layouts only');
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/art-slide/play/van-gogh-bedroom');
    await expect(page.locator('.aboard')).toBeVisible();
    await page.waitForTimeout(450);
    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
    const [pv, sh, nm, nx] = await Promise.all(['preview', 'shuffle', 'numbers-toggle', 'next-artwork'].map(box));
    for (const b of [pv, sh, nm, nx]) {
      expect(b.height).toBeGreaterThanOrEqual(44); // a thumb-sized target
      expect(b.width).toBeGreaterThanOrEqual(40);
    }
    for (const b of [sh, nm, nx]) expect(Math.abs(b.y - pv.y)).toBeLessThan(2); // one row
    // order: Information | gap | Shuffle, Numbers, Next
    expect(pv.x).toBeLessThan(sh.x);
    expect(sh.x - (pv.x + pv.width)).toBeGreaterThanOrEqual(10); // Information is kept apart from Shuffle
    expect(nm.x - (sh.x + sh.width)).toBeGreaterThanOrEqual(3);
    expect(nx.x - (nm.x + nm.width)).toBeGreaterThanOrEqual(3);
    expect(nx.x + nx.width).toBeLessThanOrEqual(w);
    for (const id of ['preview', 'shuffle', 'numbers-toggle', 'next-artwork']) {
      await expect(page.getByTestId(id).locator('.art-action-label')).toBeHidden(); // icons only: no captions on a phone
      expect(await page.getByTestId(id).getAttribute('aria-label')).toBeTruthy(); // but each one is still named for screen readers
    }
    // everything is inside the header, above the board
    const head = (await page.locator('.art-top').boundingBox())!;
    const board = (await page.locator('.aboard').boundingBox())!;
    for (const b of [pv, sh, nm, nx]) {
      expect(b.y).toBeGreaterThanOrEqual(head.y - 1);
      expect(b.y + b.height).toBeLessThanOrEqual(head.y + head.height + 1);
      expect(b.y + b.height).toBeLessThanOrEqual(board.y + 1);
    }
    expect(head.height).toBeLessThan(120); // a compact header, not a block of controls
    // the time and moves on the left do not run into the buttons
    const time = (await page.getByTestId('moves').boundingBox())!;
    expect(time.x + time.width).toBeLessThanOrEqual(pv.x);
    const trig = (await sizeTrigger(page).boundingBox())!;
    expect(trig.height).toBeGreaterThanOrEqual(36);
    expect(trig.y + trig.height).toBeLessThanOrEqual(pv.y + 1); // the piece-count menu is in the row above
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}

test('Numbers: when ON the button is filled, so it is clearly different from the page behind it', async ({ page }, info) => {
  await page.goto('/art-slide/play/degas-dance-class');
  await page.waitForTimeout(450);
  const toggle = page.getByTestId('numbers-toggle');
  const colours = () => toggle.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color, page: getComputedStyle(document.body).backgroundColor }));
  const off = await colours();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await colours()).bg).not.toBe(off.bg); // the colour has eased in
  await page.waitForTimeout(400);
  const on = await colours();
  expect(on.bg).not.toBe(on.page); // never the page's own colour
  expect(on.bg).toBe(off.fg); // filled with the text colour, the text takes the page colour (inverted)
  expect(on.fg).toBe(on.page);
  void info;
});

test('daily on a phone: three icon buttons in the header (Information, Shuffle, Numbers)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'touch layouts only');
  await page.goto('/art-slide/daily');
  await expect(page.locator('.aboard')).toBeVisible();
  await page.waitForTimeout(450);
  const [pv, nm] = await Promise.all(['preview', 'numbers-toggle'].map(async (id) => (await page.getByTestId(id).boundingBox())!));
  expect(pv.height).toBeGreaterThanOrEqual(44);
  expect(nm.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(pv.y - nm.y)).toBeLessThan(2);
  expect(pv.width).toBeGreaterThanOrEqual(40);
  await expect(page.getByTestId('preview').locator('.art-action-label')).toBeHidden();
  const sh = (await page.getByTestId('shuffle').boundingBox())!;
  expect(sh.height).toBeGreaterThanOrEqual(44);
  expect(sh.x - (pv.x + pv.width)).toBeGreaterThanOrEqual(10); // Information is kept apart from Shuffle here too
  expect(Math.abs(sh.y - pv.y)).toBeLessThan(2);
  await expect(page.getByTestId('next-artwork')).toHaveCount(0); // (no Next on the daily)
});

for (const [w, h] of [[320, 640], [375, 667], [390, 844], [430, 932], [899, 900], [1280, 800]] as const) {
  test(`the piece-count warning at ${w}px: two short lines, equal large buttons, and the board does not move`, async ({ page }, info) => {
    test.skip((w >= 900) !== (info.project.name === 'desktop'), 'one run per layout');
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/art-slide/play/seurat-grande-jatte');
    await page.waitForTimeout(450);
    const sol = await solution(page, 'free');
    await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
    await expect(page.getByTestId('moves')).toHaveText('1');
    // the board's place in the PAGE (not the viewport: clicking a tile or the menu may scroll the page, which is not a layout shift)
    const boardTop = () => page.locator('.aboard').evaluate((e) => Math.round(e.getBoundingClientRect().top + window.scrollY));
    const boardBefore = await boardTop();
    await setLevel(page, 4);
    const bar = page.getByTestId('confirm-bar');
    await expect(bar).toBeVisible();
    await page.waitForTimeout(450); // let the sheet finish sliding in before measuring
    await expect(page.getByRole('alert')).toContainText(/Switch to \d+×\d+\?/);
    await expect(bar.locator('.confirm-line')).toHaveCount(2); // the question, then what it costs
    const lines = await bar.locator('.confirm-line').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight))));
    expect(lines.every((n) => n <= 2)).toBe(true); // never a long ragged paragraph
    const [ok, cancel] = await Promise.all([page.getByTestId('confirm-size'), page.getByTestId('confirm-cancel')].map(async (l) => (await l.boundingBox())!));
    expect(ok.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(ok.width - cancel.width)).toBeLessThan(2); // equal, wide buttons
    expect(Math.abs(ok.y - cancel.y)).toBeLessThan(2);
    expect(ok.width).toBeGreaterThanOrEqual(w >= 900 ? 80 : 100);
    const barBox = (await bar.boundingBox())!;
    expect(barBox.x).toBeGreaterThanOrEqual(0);
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(w);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    if (w < 900) {
      expect(Math.abs((await boardTop()) - boardBefore)).toBeLessThan(1); // phones: the sheet floats over the header, the board stays where it was
      expect(barBox.y).toBeGreaterThanOrEqual(0);
      expect(barBox.y + barBox.height).toBeLessThan(h / 2); // at the TOP of the screen
    }
    await page.getByTestId('confirm-cancel').click();
    await expect(bar).toHaveCount(0);
    await expect(page.getByTestId('moves')).toHaveText('1');
    await setLevel(page, 4);
    await page.getByTestId('confirm-size').click();
    await expect.poll(async () => (await savedPuzzle(page, 'free')).size).toBe(4);
  });
}

test('the warning is two lines in Japanese too', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'one run is enough');
  await page.addInitScript(() => localStorage.setItem('wordslide:save', JSON.stringify({ version: 1, settings: { lang: 'ja', theme: 'system', colorblind: false, adConsent: null }, completed: 0, noHintClears: 0, dailyHistory: {}, endlessStreak: 0, maxEndlessStreak: 0, bests: { easy: {}, normal: {}, hard: {} }, history: [], inProgress: {}, lastDifficulty: 'normal' })));
  await page.goto('/art-slide/play/seurat-grande-jatte');
  const sol = await solution(page, 'free');
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await setLevel(page, 4);
  const lines = page.getByTestId('confirm-bar').locator('.confirm-line');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText('に切り替えますか？');
  await expect(lines.nth(1)).toHaveText('進行中のデータは失われます。');
});

test('a landscape phone: the warning is one compact row, so the board stays in view', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'touch layouts only');
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/art-slide/play/seurat-grande-jatte');
  await page.waitForTimeout(450);
  const sol = await solution(page, 'free');
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await setLevel(page, 4);
  const bar = page.getByTestId('confirm-bar');
  await expect(bar).toBeVisible();
  await page.waitForTimeout(450);
  const b = (await bar.boundingBox())!;
  expect(b.height).toBeLessThanOrEqual(90); // text on the left, buttons on the right
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(120); // at the top
  for (const id of ['confirm-size', 'confirm-cancel']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const ok = (await page.getByTestId('confirm-size').boundingBox())!;
  expect(ok.x).toBeGreaterThan(b.x + b.width / 2); // the buttons are on the right half
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByTestId('confirm-cancel').click();
  await expect(bar).toHaveCount(0);
});

test('a tap on the warning sheet lands on the sheet, never on a control or tile behind it', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'touch layouts only');
  await page.setViewportSize({ width: 320, height: 520 });
  await page.goto('/art-slide/play/seurat-grande-jatte');
  await page.waitForTimeout(450);
  const sol = await solution(page, 'free');
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click();
  await setLevel(page, 4);
  await expect(page.getByTestId('confirm-bar')).toBeVisible();
  await page.waitForTimeout(450);
  const b = (await page.getByTestId('confirm-bar').boundingBox())!;
  const hit = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.closest('.confirm-bar') ? 'sheet' : e?.closest('.atile') ? 'tile' : 'other'; }, { x: b.x + b.width / 2, y: b.y + 4 });
  expect(hit).toBe('sheet'); // (the header's buttons behind it are covered)
  const hit2 = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.closest('.confirm-bar') ? 'sheet' : e?.closest('button') ? 'button' : 'other'; }, { x: b.x + 20, y: b.y + b.height - 4 });
  expect(hit2).toBe('sheet');
});

// ---- the daily painting can be shuffled too ----
test('daily: SHUFFLE re-places the pieces, stays the daily, survives a reload and the clear is recorded as today\u2019s daily', async ({ page }) => {
  await page.goto('/art-slide/daily');
  await expect(page.locator('.art-loading')).toHaveCount(0);
  const first = await savedPuzzle(page, 'daily');
  const before = await snap(page);
  const sol = first.solution;
  await page.locator(`.atile[data-cell="${sol[0]}"]`).click(); // a move first: no question is asked
  await expect(page.getByTestId('moves')).toHaveText('1');
  await page.getByTestId('shuffle').click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await shuffleDailyDone(page);
  await expect(page.getByTestId('moves')).toHaveText('0');
  expect(await snap(page)).not.toBe(before);
  const saved = (await readArt(page)).inProgress.daily.puzzle as { id: string; mode: string; number: number; artworkId: string };
  expect(saved.mode).toBe('daily'); // still today's daily
  expect(saved.id).toMatch(/^artdaily-/);
  expect(typeof saved.number).toBe('number');
  const shuffled = await snap(page);
  await page.reload();
  await expect(page.locator('.atile').first()).toBeVisible();
  expect(await snap(page)).toBe(shuffled); // resumes the shuffled daily, not the original one
  await expect(page.locator('.top-kicker')).toContainText('DAILY');
  await solve(page, 'daily');
  await expect(page.getByRole('dialog', { name: CLEARED })).toBeVisible();
  const hist = (await readArt(page)).dailyHistory as Record<string, { number: number; artworkId: string }>;
  expect(Object.keys(hist)).toHaveLength(1); // recorded as the daily
  expect(Object.values(hist)[0].artworkId).toBe(saved.artworkId);
  expect(Object.values(hist)[0].number).toBe(saved.number);
});
