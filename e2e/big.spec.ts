import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && list.push(m.text()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

type Move = { id: number; dir: string };
const readBig = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('bigslide:save') ?? '{}'));
async function readSolution(page: Page, mode: 'daily' | 'endless'): Promise<Move[]> {
  await page.waitForFunction((m) => !!JSON.parse(localStorage.getItem('bigslide:save') ?? '{}').inProgress?.[m], mode);
  return (await readBig(page)).inProgress[mode].puzzle.solution;
}

/** Plays one move by tapping the piece (and the arrow if the tap was ambiguous). */
async function playMove(page: Page, m: Move) {
  const before = Number(await page.getByTestId('moves').innerText());
  await page.locator(`[data-piece="${m.id}"] .bt`).click();
  const arrow = page.getByTestId(`arrow-${m.dir}`);
  if (await arrow.count()) await arrow.click();
  await expect(page.getByTestId('moves')).toHaveText(String(before + 1));
}

async function solve(page: Page, mode: 'daily' | 'endless') {
  for (const m of await readSolution(page, mode)) await playMove(page, m);
}

test('landing offers both games; tabs switch with real URLs; back/forward work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-word')).toBeVisible();
  await expect(page.getByTestId('landing-big')).toBeVisible();
  await page.getByTestId('landing-big').click();
  await expect(page).toHaveURL(/\/big-slide$/);
  await expect(page.getByTestId('tab-big-slide')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('tab-word-slide').click();
  await expect(page).toHaveURL(/\/word-slide$/);
  await expect(page.getByTestId('daily')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/big-slide$/);
  await expect(page.getByTestId('big-daily')).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId('daily')).toBeVisible();
});

test('direct URLs and legacy hash URLs work', async ({ page }) => {
  await page.goto('/big-slide/daily');
  await expect(page.locator('.bboard .bpiece')).toHaveCount(11);
  await page.goto('/word-slide/daily');
  await expect(page.locator('.tile')).toHaveCount(15);
  await page.goto('/#/daily'); // old WORD SLIDE link
  await expect(page).toHaveURL(/\/word-slide\/daily$/);
  await expect(page.locator('.tile')).toHaveCount(15);
  await page.goto('/#/how');
  await expect(page).toHaveURL(/\/word-slide\/how$/);
  await page.goto('/privacy');
  await expect(page.locator('.topbar h1')).toHaveText('PRIVACY POLICY');
});

test('BIG SLIDE daily: 4x4 with one big tile, 10 numbers and a goal picture', async ({ page }) => {
  await page.goto('/big-slide');
  await page.getByTestId('big-daily').click();
  await expect(page).toHaveURL(/\/big-slide\/daily$/);
  await expect(page.locator('.bboard .bpiece')).toHaveCount(11);
  await expect(page.locator('.bboard .bpiece[data-kind="big"]')).toHaveCount(1);
  await expect(page.locator('.bboard .bpiece[data-kind="small"]')).toHaveCount(10);
  await expect(page.getByTestId('goal-mini')).toBeVisible();
  await page.getByTestId('goal-toggle').click();
  await expect(page.getByTestId('goal-mini')).toHaveCount(0);
  await page.getByTestId('goal-toggle').click();
  await expect(page.getByTestId('goal-mini')).toBeVisible();
});

test('illegal taps change nothing; solving clears, locks, saves under its own key', async ({ page }) => {
  await page.goto('/big-slide/daily');
  const solution = await readSolution(page, 'daily');
  // tap a piece that cannot move: pick one that is not the first solution mover and has no legal move
  const stuck = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('bigslide:save')!).inProgress.daily;
    const n = s.puzzle.size as number;
    const grid = Array(n * n).fill(-1);
    for (const p of s.pieces) for (let r = p.r; r < p.r + p.h; r++) for (let c = p.c; c < p.c + p.w; c++) grid[r * n + c] = p.id;
    const can = (p: { id: number; r: number; c: number; w: number; h: number }) =>
      [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
        const nr = p.r + dr, nc = p.c + dc;
        if (nr < 0 || nc < 0 || nr + p.h > n || nc + p.w > n) return false;
        for (let r = nr; r < nr + p.h; r++) for (let c = nc; c < nc + p.w; c++) if (grid[r * n + c] !== -1 && grid[r * n + c] !== p.id) return false;
        return true;
      });
    return (s.pieces as { id: number; r: number; c: number; w: number; h: number }[]).find((p) => !can(p))?.id ?? null;
  });
  expect(stuck).not.toBeNull();
  await page.locator(`[data-piece="${stuck}"] .bt`).click();
  await expect(page.getByTestId('moves')).toHaveText('0');
  await solve(page, 'daily');
  await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
  await expect(page.getByTestId('bigmoves')).not.toHaveText('0');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.bboard .bpiece .bt').first()).toBeDisabled(); // locked after clearing
  expect(solution.length).toBeGreaterThan(0);
  const save = await readBig(page);
  expect(save.completed).toBe(1);
  expect(Object.keys(save.dailyHistory)).toHaveLength(1);
  // separate storage: nothing from BIG SLIDE leaks into WORD SLIDE's key
  const word = await page.evaluate(() => localStorage.getItem('wordslide:save'));
  expect(word === null || !word.includes('bigslide')).toBe(true);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
});

test('progress is restored after reload', async ({ page }) => {
  await page.goto('/big-slide/daily');
  const sol = await readSolution(page, 'daily');
  await playMove(page, sol[0]);
  await page.reload();
  await expect(page.getByTestId('moves')).toHaveText('1');
});

test('endless 5x5: pick size and difficulty, solve, next puzzle', async ({ page }) => {
  await page.goto('/big-slide/endless');
  await page.getByTestId('size-5').click();
  await page.getByTestId('bdiff-easy').click();
  await expect(page.locator('.bboard .bpiece')).toHaveCount(20); // 1 big + 19 numbers
  await solve(page, 'endless');
  await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
  await page.getByRole('button', { name: 'NEXT PUZZLE' }).click();
  await expect(page.getByTestId('moves')).toHaveText('0');
  await expect(page.locator('.bboard .bpiece')).toHaveCount(20);
  const s = await readBig(page);
  expect(s.endlessStreak).toBe(1);
  expect(s.bests['5-easy'].moves).toBeGreaterThan(0);
});

test('endless 6x6 board renders', async ({ page }) => {
  await page.goto('/big-slide/endless');
  await page.getByTestId('size-6').click();
  await page.getByTestId('bdiff-easy').click();
  await expect(page.locator('.bboard .bpiece')).toHaveCount(31);
});

test('WORD SLIDE progress is untouched by visiting BIG SLIDE; theme applies to both', async ({ page }) => {
  await page.goto('/word-slide/daily');
  await expect(page.locator('.tile')).toHaveCount(15);
  await page.getByTestId('hint-first-0').click();
  await page.goto('/settings');
  await page.locator('select').selectOption('dark');
  await page.getByTestId('tab-big-slide').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('big-daily').click();
  await expect(page.locator('.bboard .bpiece')).toHaveCount(11);
  await page.getByTestId('tab-word-slide').click();
  await page.getByTestId('daily').click();
  await expect(page.getByTestId('slots-0').locator('.slot-l.shown')).toHaveCount(1); // hint survived
});

test('layout: tabs and board fit the viewport, no horizontal scroll', async ({ page }) => {
  await page.goto('/big-slide/endless');
  await page.getByTestId('size-6').click();
  await page.getByTestId('bdiff-normal').click();
  await expect(page.getByTestId('tab-word-slide')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  const box = await page.locator('.bboard').boundingBox();
  expect(box!.width).toBeGreaterThan(240);
  const vw = page.viewportSize()!.width;
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
});

const counts: Record<string, { n4: number; bigs: number }> = {
  classic: { n4: 11, bigs: 1 },
  duo: { n4: 7, bigs: 2 }, // 2 big + 5 numbers
  shapes: { n4: 9, bigs: 2 }, // L + 1x2 + 7 numbers
  mega: { n4: 8, bigs: 1 }, // 2x3 + 7 numbers
};

for (const v of ['duo', 'shapes', 'mega'] as const) {
  test(`block set ${v}: right pieces, goal picture, solvable through the UI`, async ({ page }) => {
    await page.goto('/big-slide/endless');
    await page.getByTestId(`variant-${v}`).click();
    await page.getByTestId('size-4').click();
    await page.getByTestId('bdiff-easy').click();
    await expect(page.locator('.bboard .bpiece')).toHaveCount(counts[v].n4);
    await expect(page.locator('.bboard .bpiece[data-kind="big"]')).toHaveCount(counts[v].bigs);
    await expect(page.getByTestId('goal-mini')).toBeVisible();
    if (v === 'shapes') {
      // the L block is drawn as one shaped object made of 4 joined cells
      await expect(page.locator('.bboard .bt.shaped')).toHaveCount(1);
      await expect(page.locator('.bboard .bt.shaped .cell')).toHaveCount(4);
    }
    await solve(page, 'endless');
    await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
    const save = await readBig(page);
    expect(Object.keys(save.bests).some((k: string) => k.startsWith(`${v}-4-`))).toBe(true);
  });
}

test('variant choice is remembered and shown in the title', async ({ page }) => {
  await page.goto('/big-slide/endless');
  await page.getByTestId('variant-duo').click();
  await page.getByTestId('size-5').click();
  await page.getByTestId('bdiff-normal').click();
  await expect(page.locator('.topbar h1')).toContainText('DUO');
  await expect(page.locator('.topbar h1')).toContainText('5×5');
  await page.reload();
  await expect(page.locator('.bboard .bpiece[data-kind="big"]')).toHaveCount(2); // resumed in progress
  await page.getByRole('button', { name: 'NEW' }).click();
  await expect(page.getByTestId('variant-duo')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('size-5')).toHaveAttribute('aria-pressed', 'true');
});
