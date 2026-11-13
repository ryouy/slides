import { blankIndex, boardFromLetters, lettersOf, moveTile, neighbors } from './board';
import { matchWords } from './matcher';
import { pick, randInt, rngFromString, shuffled, type Rng } from './rng';
import { CELLS, type Board, type Difficulty, type Mode, type Puzzle, type WordSet } from './types';
import { FOUR, THREE, WORDS_VERSION, poolFor } from '../data/words';

/** Bump when the generation algorithm changes (it changes which puzzle a seed yields). */
export const GENERATOR_VERSION = 'g1';

const SETTINGS: Record<Difficulty, { steps: number; minMisplaced: number }> = {
  easy: { steps: 30, minMisplaced: 8 },
  normal: { steps: 70, minMisplaced: 11 },
  hard: { steps: 140, minMisplaced: 13 },
};

export function pickWords(rng: Rng, difficulty: Difficulty): WordSet {
  const top = shuffled(rng, poolFor(FOUR, difficulty)).slice(0, 3) as [string, string, string];
  const bottom = pick(rng, poolFor(THREE, difficulty));
  return { top, bottom };
}

export function goalLetters(words: WordSet): (string | null)[] {
  return [...words.top.flatMap((w) => w.split('')), ...words.bottom.split(''), null];
}

/**
 * Random walk from the goal board with legal moves only, so the result is reachable by
 * construction. Avoids undoing the previous move and avoids revisiting arrangements.
 * Returns the final board and the click sequence that solves it.
 */
function scramble(rng: Rng, goal: (string | null)[], steps: number, minMisplaced: number) {
  // arrangement[i] = goal index of the tile at cell i (-1 = blank)
  let arr = goal.map((_, i) => (i === CELLS - 1 ? -1 : i));
  let blank = CELLS - 1;
  let prev = -1;
  const visited = new Set<string>([arr.join(',')]);
  const path: number[] = [blank];
  const limit = steps + 400;
  for (let n = 0; n < limit; n++) {
    const misplaced = arr.filter((g, i) => g !== -1 && goal[g] !== goal[i]).length + (arr[CELLS - 1] === -1 ? 0 : 1);
    if (n >= steps && misplaced >= minMisplaced) break;
    const options = neighbors(blank).filter((c) => c !== prev);
    const fresh = options.filter((c) => {
      const a = arr.slice();
      a[blank] = a[c];
      a[c] = -1;
      return !visited.has(a.join(','));
    });
    const next = pick(rng, fresh.length ? fresh : options);
    arr = arr.slice();
    arr[blank] = arr[next];
    arr[next] = -1;
    visited.add(arr.join(','));
    prev = blank;
    blank = next;
    path.push(blank);
  }
  const letters = arr.map((g) => (g === -1 ? null : goal[g]));
  // undo: click the tile sitting where the blank was previously, walking the path backwards
  const solution = path.slice(0, -1).reverse();
  return { letters, solution };
}

export function validatePuzzle(p: Puzzle): boolean {
  if (p.letters.length !== CELLS) return false;
  if (p.words.top.some((w) => w.length !== 4) || p.words.bottom.length !== 3) return false;
  if (new Set(p.words.top).size !== 3) return false;
  if (p.letters.filter((l) => l === null).length !== 1) return false;
  const goal = goalLetters(p.words).slice().sort().join('');
  if (p.letters.slice().sort().join('') !== goal) return false;
  let board: Board = boardFromLetters(p.letters);
  if (matchWords(lettersOf(board), p.words).solved) return false; // must not start solved
  for (const c of p.solution) {
    const next = moveTile(board, c);
    if (!next) return false;
    board = next;
  }
  return matchWords(lettersOf(board), p.words).solved && blankIndex(board) === CELLS - 1;
}

export interface GenerateOptions {
  seed: string;
  id: string;
  mode: Mode;
  difficulty: Difficulty;
  number?: number;
}

export function generatePuzzle(o: GenerateOptions): Puzzle {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = rngFromString(`${GENERATOR_VERSION}|${o.seed}|${attempt}`);
    const words = pickWords(rng, o.difficulty);
    const goal = goalLetters(words);
    const cfg = SETTINGS[o.difficulty];
    const { letters, solution } = scramble(rng, goal, cfg.steps + randInt(rng, 10), cfg.minMisplaced);
    const puzzle: Puzzle = {
      id: o.id,
      mode: o.mode,
      difficulty: o.difficulty,
      number: o.number,
      words,
      letters,
      solution,
      generatorVersion: GENERATOR_VERSION,
      wordsVersion: WORDS_VERSION,
    };
    // reject puzzles that start nearly finished
    if (validatePuzzle(puzzle) && matchWords(letters, words).count <= 1) return puzzle;
  }
  throw new Error('Puzzle generation failed');
}

/* ---------- Daily (Japan Standard Time) ---------- */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** Daily #1 is this date. */
export const DAILY_EPOCH = '2026-11-01';

export function jstDateKey(now: number = Date.now()): string {
  return new Date(now + JST_OFFSET_MS).toISOString().slice(0, 10);
}

const dayNumber = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86400000);

export function dailyNumber(key: string): number {
  return dayNumber(key) - dayNumber(DAILY_EPOCH) + 1;
}

export function generateDaily(dateKey: string): Puzzle {
  return generatePuzzle({
    seed: `daily|${dateKey}`,
    id: `daily-${dateKey}`,
    mode: 'daily',
    difficulty: 'normal',
    number: dailyNumber(dateKey),
  });
}

export function generateEndless(difficulty: Difficulty, seed = `${Date.now()}-${Math.random()}`): Puzzle {
  return generatePuzzle({ seed: `endless|${seed}`, id: `endless-${seed}`, mode: 'endless', difficulty });
}
