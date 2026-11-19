/**
 * Data + golden vectors for the Swift WORD SLIDE port (run by `npm run ios:data` or `npx vite-node ios/scripts/export-word.ts`).
 *  - ios/App/App/public/data/word/words.json (generated, git-ignored): the parsed word lists + WORDS_VERSION from src/data/words.ts
 *  - ios/SlideKit/Tests/SlideCoreTests/Golden/word.json: puzzles, matcher/wordle/hint results, reducer traces, stats results
 *    produced by the WEB code, which WordTests.swift must reproduce exactly.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { FOUR, THREE, WORDS_VERSION } from '../../src/data/words';
import { GENERATOR_VERSION, generateDaily, generatePuzzle } from '../../src/core/generator';
import { lettersOf } from '../../src/core/board';
import { newGame, reducer, type Action, type GameState } from '../../src/core/game';
import { matchWords } from '../../src/core/matcher';
import { evaluateRow, checkRow } from '../../src/core/wordle';
import { currentDailyStreak, maxDailyStreak, recordClear } from '../../src/storage/stats';
import { defaultSave } from '../../src/storage/storage';
import { dailyNumber } from '../../src/utils/date';
import type { Difficulty, Puzzle } from '../../src/core/types';

const strip = (m: Record<Difficulty, { word: string; category: string; definition: string }[]>) => ({
  easy: m.easy.map(({ word, category, definition }) => ({ word, category, definition })),
  normal: m.normal.map(({ word, category, definition }) => ({ word, category, definition })),
  hard: m.hard.map(({ word, category, definition }) => ({ word, category, definition })),
});

const dataDir = new URL('../App/App/public/data/word/', import.meta.url).pathname;
mkdirSync(dataDir, { recursive: true });
writeFileSync(dataDir + 'words.json', JSON.stringify({ version: WORDS_VERSION, generator: GENERATOR_VERSION, four: strip(FOUR), three: strip(THREE) }));

const puzzleOut = (seed: string, p: Puzzle) => ({
  seed,
  id: p.id,
  mode: p.mode,
  difficulty: p.difficulty,
  number: p.number ?? null,
  words: p.words,
  clues: p.clues.map((c) => ({ word: c.word, category: c.category, definition: c.definition })),
  letters: p.letters,
  solution: p.solution,
});

const dates = ['2026-11-01', '2026-11-19', '2026-12-31', '2027-02-28', '2027-06-15'];
const daily = dates.map((d) => ({ date: d, number: dailyNumber(d), puzzle: puzzleOut(`daily|${d}`, generateDaily(d)) }));

const seeds = ['alpha', 'endless|1731900000000-0.123', 'ü日本', 'z'];
const puzzles: unknown[] = [];
for (const difficulty of ['easy', 'normal', 'hard'] as const)
  for (const seed of seeds) puzzles.push(puzzleOut(seed, generatePuzzle({ seed, id: `t-${difficulty}`, mode: 'endless', difficulty })));

// matcher
const base = generateDaily('2026-11-19');
const goal = [...base.words.top.flatMap((w) => w.split('')), ...base.words.bottom.split(''), null] as (string | null)[];
const swapped = goal.slice();
[swapped[0], swapped[1]] = [swapped[1], swapped[0]];
const rowSwap = [...goal.slice(4, 8), ...goal.slice(0, 4), ...goal.slice(8)];
const matcher = [
  { words: base.words, letters: goal },
  { words: base.words, letters: swapped },
  { words: base.words, letters: rowSwap },
  { words: base.words, letters: base.letters },
  { words: base.words, letters: [...goal.slice(0, 15), 'X'].map((x, i) => (i === 14 ? null : x)) },
].map((c) => ({ ...c, result: matchWords(c.letters, c.words) }));

// wordle
const wordleCases: [(string | null)[], string][] = [
  [['B', 'R', 'A', 'D'], 'BIRD'], [['L', 'L', 'L', 'L'], 'BALL'], [['A', null, 'A', 'A'], 'AXAA'],
  [['C', 'A', 'T'], 'CAT'], [['T', 'A', 'C'], 'CAT'], [['E', 'E', 'R', 'T'], 'TREE'], [['T', 'T', null, 'T'], 'TEST'],
];
const wordle = wordleCases.map(([cells, target]) => ({ cells, target, marks: evaluateRow(cells, target) }));
const checkRows = [0, 1, 2, 3].map((row) => ({ letters: base.letters, row, word: row === 3 ? base.words.bottom : base.words.top[0], ...checkRow(base.letters, row, row === 3 ? base.words.bottom : base.words.top[0]) }));

// reducer traces
const summary = (s: GameState) => ({
  letters: lettersOf(s.board), moves: s.moves, checks: s.checks, elapsedMs: s.elapsedMs, started: s.started, status: s.status,
  marks: s.marks, selRow: s.selRow, selCard: s.selCard, hintUse: s.hintUse, history: s.history, cards: s.cards,
});
function trace(p: Puzzle, actions: Action[]) {
  let s = newGame(p);
  const steps = actions.map((a) => { s = reducer(s, a); return summary(s); });
  return { puzzle: puzzleOut('trace', p), actions, steps };
}
const reducerTraces = [daily[1].puzzle.seed, 'alpha'].map((seed, i) => {
  const p = i === 0 ? generateDaily('2026-11-19') : generatePuzzle({ seed, id: 't', mode: 'endless', difficulty: 'hard' });
  const acts: Action[] = [
    { type: 'tick', ms: 500 },
    { type: 'selRow', row: 0 }, { type: 'selCard', card: 1 }, { type: 'check' }, { type: 'selRow', row: 3 }, { type: 'check' }, { type: 'selRow', row: 3 },
    { type: 'selCard', card: 3 }, { type: 'selCard', card: 3 }, { type: 'selRow', row: 9 },
    { type: 'hint', card: 0, kind: 'extra' }, { type: 'hint', card: 0, kind: 'first' }, { type: 'hint', card: 0, kind: 'extra' }, { type: 'hint', card: 0, kind: 'extra' },
    { type: 'hint', card: 0, kind: 'category' }, { type: 'hint', card: 2, kind: 'definition' }, { type: 'hint', card: 2, kind: 'definition' }, { type: 'hint', card: 3, kind: 'first' },
    { type: 'tick', ms: 1000 },
    { type: 'dir', dir: 'up' }, { type: 'dir', dir: 'left' }, { type: 'dir', dir: 'down' }, { type: 'dir', dir: 'right' }, { type: 'dir', dir: 'right' },
    { type: 'move', cell: 0 }, { type: 'move', cell: 15 },
    ...p.solution.map((cell) => ({ type: 'move', cell }) as Action),
    { type: 'tick', ms: 100 }, { type: 'move', cell: 1 }, { type: 'check' }, { type: 'restart' },
  ];
  return trace(p, acts);
});

// stats
const hist: Record<string, unknown> = {};
for (const d of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']) hist[d] = {};
const streaks = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-09', '2026-11-10', '2026-11-12'].map((today) => ({ today, current: currentDailyStreak(hist, today) }));
let sv = defaultSave();
const recs = [
  { mode: 'daily', difficulty: 'normal', dateKey: '2026-11-19', number: 19, timeMs: 90000, moves: 40, checks: 1, hints: 2, noHint: false },
  { mode: 'daily', difficulty: 'normal', dateKey: '2026-11-19', number: 19, timeMs: 80000, moves: 30, checks: 0, hints: 0, noHint: true },
  { mode: 'endless', difficulty: 'easy', dateKey: '2026-11-19', timeMs: 70000, moves: 50, checks: 0, hints: 0, noHint: true },
  { mode: 'endless', difficulty: 'easy', dateKey: '2026-11-19', timeMs: 75000, moves: 20, checks: 2, hints: 2, noHint: false },
  { mode: 'endless', difficulty: 'hard', dateKey: '2026-11-20', timeMs: 200000, moves: 120, checks: 3, hints: 3 },
] as const;
const afterRecs = recs.map((r) => { sv = recordClear(sv, { ...r }); return { completed: sv.completed, noHintClears: sv.noHintClears, endlessStreak: sv.endlessStreak, maxEndlessStreak: sv.maxEndlessStreak, bests: sv.bests, dailyHistory: sv.dailyHistory, historyLen: sv.history.length, last: sv.history[sv.history.length - 1] }; });

const goldenDir = new URL('../SlideKit/Tests/SlideCoreTests/Golden/', import.meta.url).pathname;
mkdirSync(goldenDir, { recursive: true });
writeFileSync(
  goldenDir + 'word.json',
  JSON.stringify({ wordsVersion: WORDS_VERSION, generatorVersion: GENERATOR_VERSION, daily, puzzles, matcher, wordle, checkRows, reducerTraces, stats: { streaks, maxStreak: maxDailyStreak(hist), recs, afterRecs } }),
);
console.log('word: wrote words.json and Golden/word.json', daily.length, puzzles.length);
