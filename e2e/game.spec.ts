import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && list.push(m.text()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
});

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

type Save = { inProgress: { daily?: { puzzle: { solution: number[] } }; endless?: { puzzle: { solution: number[] } } } };
const readSave = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('wordslide:save') ?? '{}'));
/** The game is persisted in an effect; wait until it exists. */
async function readSolution(page: Page, mode: 'daily' | 'endless'): Promise<number[]> {
  await page.waitForFunction((m) => !!JSON.parse(localStorage.getItem('wordslide:save') ?? '{}').inProgress?.[m], mode);
  return ((await readSave(page)) as Save).inProgress[mode]!.puzzle.solution;
}

async function solve(page: Page, mode: 'daily' | 'endless') {
  const solution = await readSolution(page, mode);
  for (const cell of solution) {
    await page.locator(`.tile[data-cell="${cell}"]`).click();
    await page.waitForTimeout(30);
  }
}

async function clickFirstMove(page: Page, mode: 'daily' | 'endless', n = 0) {
  const cell = (await readSolution(page, mode))[n];
  await page.locator(`.tile[data-cell="${cell}"]`).click();
}

test('arrow keys move tiles', async ({ page }) => {
  await page.getByTestId('daily').click();
  await expect(page.locator('.tile')).toHaveCount(15);
  await expect
    .poll(async () => {
      for (const k of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) await page.keyboard.press(k);
      return Number(await page.getByTestId('moves').innerText());
    })
    .toBeGreaterThan(0);
});

test('home shows menu and daily board has 15 tiles', async ({ page }) => {
  await expect(page.getByText('Daily Puzzle')).toBeVisible();
  await page.getByTestId('daily').click();
  await expect(page.locator('.tile')).toHaveCount(15);
  await expect(page.getByTestId('found')).toContainText('/ 4');
});

test('check colours tiles, moving clears them, history persists', async ({ page }) => {
  await page.getByTestId('daily').click();
  await page.getByRole('button', { name: 'CHECK' }).click();
  await expect(page.getByTestId('checks')).toHaveText('1');
  expect(await page.locator('.tile.m-green, .tile.m-yellow, .tile.m-gray').count()).toBeGreaterThan(10);
  await expect(page.locator('.history .mini-wrap')).toHaveCount(1);
  // make a legal move: click any tile adjacent to the blank
  await clickFirstMove(page, 'daily');
  expect(await page.locator('.tile.m-green, .tile.m-yellow, .tile.m-gray').count()).toBe(0);
  await expect(page.locator('.history .mini-wrap')).toHaveCount(1);
});

test('solving the daily clears it, saves, restores after reload', async ({ page }) => {
  await page.getByTestId('daily').click();
  await solve(page, 'daily');
  await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
  await expect(page.getByTestId('found')).toContainText('4');
  await page.getByRole('button', { name: 'Close' }).click();
  // tiles locked after clearing
  await expect(page.locator('.tile').first()).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
  const s = await readSave(page);
  expect(s.completed).toBe(1);
  expect(Object.keys(s.dailyHistory)).toHaveLength(1);
});

test('mid-game progress is restored after reload', async ({ page }) => {
  await page.getByTestId('daily').click();
  await clickFirstMove(page, 'daily');
  await clickFirstMove(page, 'daily', 1);
  const moves = await page.getByTestId('moves').innerText();
  expect(Number(moves)).toBeGreaterThan(0);
  const before = await page.locator('.tile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-cell')}${e.getAttribute('data-letter')}`).sort());
  await page.reload();
  await expect(page.getByTestId('moves')).toHaveText(moves);
  const after = await page.locator('.tile').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-cell')}${e.getAttribute('data-letter')}`).sort());
  expect(after).toEqual(before);
});

test('endless: pick difficulty, solve, next puzzle', async ({ page }) => {
  await page.getByTestId('endless').click();
  await page.getByTestId('diff-easy').click();
  await expect(page.locator('.tile')).toHaveCount(15);
  await solve(page, 'endless');
  await expect(page.getByRole('dialog', { name: 'Puzzle cleared' })).toBeVisible();
  await page.getByRole('button', { name: 'NEXT PUZZLE' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('moves')).toHaveText('0');
  const s = await readSave(page);
  expect(s.endlessStreak).toBe(1);
  expect(s.bests.easy.moves).toBeGreaterThan(0);
});

test('pages render and dark theme applies', async ({ page }) => {
  for (const r of ['how', 'stats', 'settings', 'about', 'privacy', 'contact', 'terms']) {
    await page.goto(`/#/${r}`);
    await expect(page.locator('.topbar h1')).toBeVisible();
  }
  await page.goto('/#/settings');
  await page.locator('select').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('layout fits viewport without horizontal scroll', async ({ page }) => {
  await page.getByTestId('daily').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  const box = await page.locator('.board').boundingBox();
  expect(box!.width).toBeGreaterThan(240);
});
