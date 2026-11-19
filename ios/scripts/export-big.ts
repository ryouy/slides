/**
 * Golden vectors for the Swift BIG SLIDE port (run by `npm run ios:data` or `npx vite-node ios/scripts/export-big.ts`).
 * Writes ios/SlideKit/Tests/SlideCoreTests/Golden/big.json: daily puzzles for several dates and endless seeds across board
 * sizes / variants / difficulties, produced by the WEB code (goal, initial board, solution), plus streak/best vectors.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateBigDaily, generateBigEndless, BIG_GENERATOR_VERSION } from '../../src/games/big-slide/logic/generator';
import { cellsOf } from '../../src/games/big-slide/logic/board';
import { currentDailyStreak, maxDailyStreak, updateBest } from '../../src/storage/stats';
import type { BigPuzzle, Piece } from '../../src/games/big-slide/logic/types';

// The generator has a wall-clock budget for non-classic boards; freeze the clock so the vectors never depend on machine speed.
const realNow = Date.now;
Date.now = () => 0;

const piece = (p: Piece) => ({ id: p.id, kind: p.kind, w: p.w, h: p.h, r: p.r, c: p.c, label: p.label, cells: cellsOf(p) });
const puzzle = (p: BigPuzzle) => ({
  id: p.id,
  mode: p.mode,
  difficulty: p.difficulty,
  size: p.size,
  variant: p.variant ?? 'classic',
  number: p.number ?? null,
  generatorVersion: p.generatorVersion,
  goal: p.goal.map(piece),
  initial: p.initial.map((x) => ({ id: x.id, r: x.r, c: x.c })),
  solution: p.solution,
});

const dates = ['2026-11-01', '2026-11-18', '2026-11-19', '2026-12-25', '2027-01-01', '2027-02-10', '2027-06-30', '2028-03-01'];
const daily = dates.map((date) => ({ date, puzzle: puzzle(generateBigDaily(date)) }));

const variants = ['classic', 'duo', 'shapes', 'mega'] as const;
const diffs = ['easy', 'normal', 'hard'] as const;
const endless: unknown[] = [];
for (const variant of variants) for (const size of [4, 5, 6] as const) for (const difficulty of diffs) {
  for (const seed of ['alpha', '1731900000000-0.123456']) {
    if (size === 6 && difficulty === 'hard' && seed !== 'alpha') continue;
    const p = generateBigEndless(size, difficulty, seed, variant);
    endless.push({ seed, requested: { variant, size, difficulty }, puzzle: puzzle(p) });
  }
}

const dh = (...ds: string[]) => Object.fromEntries(ds.map((d) => [d, { number: 1, timeMs: 1, moves: 1, bigMoves: 1 }]));
const streaks = [
  { days: ['2026-11-17', '2026-11-18', '2026-11-19'], today: '2026-11-19' },
  { days: ['2026-11-16', '2026-11-17', '2026-11-18'], today: '2026-11-19' },
  { days: ['2026-11-10', '2026-11-11', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-19'], today: '2026-11-19' },
  { days: ['2026-12-30', '2026-12-31', '2027-01-01'], today: '2027-01-02' },
  { days: [], today: '2026-11-19' },
].map((s) => ({ ...s, current: currentDailyStreak(dh(...s.days), s.today), max: maxDailyStreak(dh(...s.days)) }));

Date.now = realNow;
const bests = [{ prev: {}, timeMs: 5000, moves: 12 }, { prev: { timeMs: 4000, moves: 20 }, timeMs: 5000, moves: 12 }].map((b) => ({ ...b, out: updateBest(b.prev, b.timeMs, b.moves) }));

const dir = new URL('../SlideKit/Tests/SlideCoreTests/Golden/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}big.json`, JSON.stringify({ generatorVersion: BIG_GENERATOR_VERSION, daily, endless, streaks, bests }));
console.log(`big.json: ${daily.length} daily, ${endless.length} endless`);
