import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && list.push(m.text()));
  await page.goto('/word-slide');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/word-slide');
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

test('word cards show length, category and hidden slots (Normal: category free, meaning hidden)', async ({ page }) => {
  await page.getByTestId('daily').click();
  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId(`slots-${i}`).locator('.slot-l')).toHaveCount(i === 3 ? 3 : 4);
    await expect(page.getByTestId(`cat-${i}`)).not.toHaveText('? ? ?');
    await expect(page.getByTestId(`def-${i}`)).toHaveCount(0);
  }
  await expect(page.getByTestId('card-3')).toContainText('3 letters');
  await expect(page.getByTestId('card-0')).toContainText('4 letters');
});

test('hints reveal step by step, are recorded, and survive reload', async ({ page }) => {
  await page.getByTestId('daily').click();
  await expect(page.getByTestId('hint-extra-0')).toBeDisabled(); // needs 1st letter first
  await page.getByTestId('hint-definition-0').click();
  await expect(page.getByTestId('def-0')).toBeVisible();
  await page.getByTestId('hint-first-0').click();
  await page.getByTestId('hint-extra-0').click();
  const letters = await page.getByTestId('slots-0').locator('.slot-l').allInnerTexts();
  expect(letters.filter(Boolean)).toHaveLength(2);
  expect(letters[0]).not.toBe('');
  expect(letters[1]).not.toBe('');
  await page.reload();
  await expect(page.getByTestId('def-0')).toBeVisible();
  expect((await page.getByTestId('slots-0').locator('.slot-l').allInnerTexts()).filter(Boolean)).toHaveLength(2);
  await page.waitForFunction(() => {
    const u = JSON.parse(localStorage.getItem('wordslide:save') ?? '{}').inProgress?.daily?.hintUse;
    return u && u.definition === 1 && u.first === 1 && u.extra === 1 && u.category === 0;
  });
});

test('CHECK compares the chosen row with the chosen card only', async ({ page }) => {
  await page.getByTestId('daily').click();
  const check = page.getByRole('button', { name: 'CHECK' });
  await expect(check).toBeDisabled();
  await page.getByTestId('row-1').click();
  await expect(check).toBeDisabled(); // no card yet
  await page.getByTestId('select-card-2').click();
  await expect(page.getByTestId('check-msg')).toHaveText('ROW 2 → WORD 3');
  await expect(page.locator('.row-sel')).toHaveAttribute('data-row', '1');
  await check.click();
  await expect(page.getByTestId('checks')).toHaveText('1');
  // only the 4 tiles of row 2 are coloured
  await expect(page.locator('.tile.m-green, .tile.m-yellow, .tile.m-gray')).toHaveCount(4);
  const rows = await page.locator('.tile.m-green, .tile.m-yellow, .tile.m-gray').evaluateAll((els) => els.map((e) => Math.floor(Number(e.getAttribute('data-cell')) / 4)));
  expect(new Set(rows)).toEqual(new Set([1]));
  await expect(page.locator('.history .h-row')).toHaveCount(1);
  await expect(page.locator('.history .h-row')).toContainText('ROW 2 → WORD 3');
  await clickFirstMove(page, 'daily');
  await expect(page.locator('.tile.m-green, .tile.m-yellow, .tile.m-gray')).toHaveCount(0);
  await expect(page.locator('.history .h-row')).toHaveCount(1);
});

test('bottom row pairs with the 3-letter card and checks 3 cells', async ({ page }) => {
  await page.getByTestId('daily').click();
  await page.getByTestId('row-3').click();
  await expect(page.getByTestId('check-msg')).toHaveText('ROW 4 → WORD 4');
  await page.getByRole('button', { name: 'CHECK' }).click();
  await expect(page.locator('.history .mini').first().locator('.mc')).toHaveCount(3);
  // a 4-letter card is dimmed while ROW 4 is selected
  await expect(page.getByTestId('card-0')).toHaveClass(/dim/);
});

test('hard/easy starting hints and daily fairness', async ({ page, browser }) => {
  await page.getByTestId('endless').click();
  await page.getByTestId('diff-hard').click();
  await expect(page.getByTestId('cat-0')).toHaveText('? ? ?');
  await page.getByTestId('hint-category-0').click();
  await expect(page.getByTestId('cat-0')).not.toHaveText('? ? ?');
  await page.getByRole('button', { name: 'NEW' }).click();
  await page.getByTestId('diff-easy').click();
  await expect(page.getByTestId('def-2')).toBeVisible();
  await expect(page.getByTestId('cat-2')).not.toHaveText('? ? ?');
  // daily: two independent players get identical starting card conditions
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/word-slide/daily');
  await expect(p2.locator('.tile')).toHaveCount(15);
  await page.goto('/word-slide/daily');
  await expect(page.locator('.tile')).toHaveCount(15);
  const cats = (p: Page) => p.locator('[data-testid^="cat-"]').allInnerTexts();
  expect(await cats(p2)).toEqual(await cats(page));
  expect(await p2.locator('[data-testid^="def-"]').count()).toBe(0);
  await ctx.close();
});

test('solving the daily clears it, saves, restores after reload', async ({ page }) => {
  await page.getByTestId('daily').click();
  await solve(page, 'daily');
  await expect(page.getByRole('dialog', { name: /CLEARED!|COMPLETE!/ })).toBeVisible();
  await expect(page.getByTestId('found')).toContainText('4');
  await expect(page.getByTestId('no-hint')).toHaveText('NO HINT CLEAR');
  await page.getByRole('button', { name: 'Close' }).click();
  // tiles locked after clearing
  await expect(page.locator('.tile').first()).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('dialog', { name: /CLEARED!|COMPLETE!/ })).toBeVisible();
  const s = await readSave(page);
  expect(s.completed).toBe(1);
  expect(Object.keys(s.dailyHistory)).toHaveLength(1);
});

test('using a hint removes NO HINT CLEAR', async ({ page }) => {
  await page.getByTestId('daily').click();
  await page.getByTestId('hint-first-3').click();
  await solve(page, 'daily');
  await expect(page.getByRole('dialog', { name: /CLEARED!|COMPLETE!/ })).toBeVisible();
  await expect(page.getByTestId('no-hint')).toHaveCount(0);
  await expect(page.getByTestId('hint-sum')).toHaveText('1');
});

test('completed words are outlined and their cards ticked', async ({ page }) => {
  await page.getByTestId('daily').click();
  const solution = await readSolution(page, 'daily');
  for (const cell of solution.slice(0, solution.length - 1)) await page.locator(`.tile[data-cell="${cell}"]`).click();
  await expect(page.getByTestId('found')).toContainText('/ 4');
  await expect(page.locator('.clue.done').first()).toBeVisible();
  await expect(page.locator('.tile.found').first()).toBeVisible();
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
  await expect(page.getByRole('dialog', { name: /CLEARED!|COMPLETE!/ })).toBeVisible();
  await page.getByRole('button', { name: 'NEXT PUZZLE' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('moves')).toHaveText('0');
  const s = await readSave(page);
  expect(s.endlessStreak).toBe(1);
  expect(s.bests.easy.moves).toBeGreaterThan(0);
});

test('pages render and dark theme applies', async ({ page }) => {
  for (const r of ['how', 'stats', 'settings', 'about', 'privacy', 'contact', 'terms']) {
    await page.goto(r === 'settings' || r === 'about' || r === 'privacy' || r === 'contact' || r === 'terms' ? `/${r}` : `/word-slide/${r}`);
    await expect(page.locator('.topbar h1')).toBeVisible();
  }
  await page.goto('/settings');
  await page.getByTestId('theme-select').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('layout fits viewport without horizontal scroll', async ({ page }) => {
  await page.getByTestId('daily').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  const box = await page.locator('.board').boundingBox();
  expect(box!.width).toBeGreaterThan(240);
});
