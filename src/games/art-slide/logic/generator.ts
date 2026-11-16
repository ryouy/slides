import { rngFromString, pick, type Rng } from '../../../utils/rng';
import { dailyNumber } from '../../../utils/date';
import { getArtwork } from '../data';
import { cellCount, isSolved, misplacedCount, moveTile, neighbors, solvedBoard, type ArtBoard, type ArtLevel, type Dims } from './board';
import { aspectOf, gridFor } from './grid';

/** Bump when the shuffling algorithm changes (it changes which board a seed yields). Artwork choice for the daily puzzle does NOT depend on it. */
export const ART_GENERATOR_VERSION = 'a2';

export interface ArtPuzzle {
  id: string;
  mode: 'daily' | 'endless';
  /** Difficulty level (3-7; higher values create finer grids). */
  size: ArtLevel;
  /** Grid of this puzzle (follows the painting's proportions). */
  cols: number;
  rows: number;
  artworkId: string;
  number?: number;
  initial: ArtBoard;
  /** Cells to click, in order, that solve `initial` (the generator's guarantee). */
  solution: number[];
  generatorVersion: string;
}

const BASE: Record<ArtLevel, { steps: number }> = { 3: { steps: 40 }, 4: { steps: 110 }, 5: { steps: 240 }, 6: { steps: 360 }, 7: { steps: 500 } };

/** How long a scramble is for a level and grid (scaled by the piece count). */
export function scrambleSteps(level: ArtLevel, d: Dims) {
  const count = cellCount(d);
  return { steps: Math.round(BASE[level].steps * Math.pow(count / (level * level), 1.5)), minMisplaced: Math.max(4, Math.round(count * 0.6)) };
}

/**
 * Random walk from the solved board with legal moves only, so the result is always solvable.
 * Avoids undoing the previous move and revisiting boards.
 */
export function shuffleBoard(rng: Rng, level: ArtLevel, d: Dims) {
  const { steps, minMisplaced } = scrambleSteps(level, d);
  let board = solvedBoard(d);
  let blank = cellCount(d) - 1;
  let prev = -1;
  const visited = new Set([board.join(',')]);
  const path = [blank];
  for (let i = 0; i < steps + 400; i++) {
    if (i >= steps && misplacedCount(board) >= minMisplaced && !isSolved(board)) break;
    const options = neighbors(blank, d).filter((c) => c !== prev);
    const fresh = options.filter((c) => {
      const b = board.slice();
      b[blank] = b[c];
      b[c] = null;
      return !visited.has(b.join(','));
    });
    const next = pick(rng, fresh.length ? fresh : options);
    board = moveTile(board, d, next)!;
    visited.add(board.join(','));
    prev = blank;
    blank = next;
    path.push(blank);
  }
  // undo: click the tile that sits where the blank was before, newest first
  return { board, solution: path.slice(0, -1).reverse() };
}

/**
 * Random walk from ANY board (legal moves only, no undo of the previous move, no revisits).
 * Used by SHUFFLE: the returned `clicks` are the tiles to slide, in order, so the shuffle can be shown
 * as real sliding. Any board reachable by play is solvable, so the result always is too.
 */
export function shuffleFromBoard(rng: Rng, d: Dims, start: ArtBoard, steps: number, minMisplaced: number) {
  let board = start;
  let blank = start.indexOf(null);
  let prev = -1;
  const startKey = board.join(',');
  const visited = new Set([startKey]);
  const clicks: number[] = [];
  // The visible animation must stay reasonably short even when a random walk
  // happens to revisit nearby states. Allow up to 25% extra moves to improve mixing.
  const maxSteps = steps + Math.ceil(steps * 0.25);
  for (let i = 0; i < maxSteps; i++) {
    if (i >= steps && misplacedCount(board) >= minMisplaced && !isSolved(board) && board.join(',') !== startKey) break;
    const options = neighbors(blank, d).filter((c) => c !== prev);
    const fresh = options.filter((c) => {
      const b = board.slice();
      b[blank] = b[c];
      b[c] = null;
      return !visited.has(b.join(','));
    });
    const next = pick(rng, fresh.length ? fresh : options);
    board = moveTile(board, d, next)!;
    visited.add(board.join(','));
    prev = blank;
    blank = next;
    clicks.push(next);
  }
  return { board, clicks };
}

/**
 * Visible shuffle: keep 3x3 short, but cover substantially more of a large
 * painting. The quadratic term grows the walk where there are many tiles.
 * Real sliding remains visible: the delay is never less than 110ms.
 *
 * Empirical sanity check for solved boards, 100 seeded walks at 9x8:
 * median 53/72 tiles displaced after ~143 slides.
 * The initial/daily puzzle generation algorithm is unchanged.
 */
export function visibleShuffleSteps(_level: ArtLevel, d: Dims) {
  const count = cellCount(d);
  return {
    steps: Math.round(14 + 0.85 * count + 0.013 * count * count),
    minMisplaced: Math.max(4, Math.round(count * 0.5)),
  };
}

/** Time between actual tile slides: never quicker than 110ms, even on dense boards. */
export function visibleShuffleStepMs(d: Dims): number {
  return Math.max(110, Math.round(190 - 10 * Math.sqrt(cellCount(d))));
}

export function validateArtPuzzle(p: ArtPuzzle): boolean {
  const d: Dims = { cols: p.cols, rows: p.rows };
  if (p.initial.length !== cellCount(d) || p.initial.filter((t) => t === null).length !== 1) return false;
  if (isSolved(p.initial)) return false;
  let b: ArtBoard = p.initial;
  for (const c of p.solution) {
    const next = moveTile(b, d, c);
    if (!next) return false;
    b = next;
  }
  return isSolved(b);
}

export interface ArtGenerateOptions {
  seed: string;
  id: string;
  mode: 'daily' | 'endless';
  size: ArtLevel;
  artworkId: string;
  number?: number;
}

/** Grid of a painting at a level (a square grid for an unknown id, which only tests use). */
export function dimsForArtwork(artworkId: string, level: ArtLevel): Dims {
  const art = getArtwork(artworkId);
  return gridFor(art ? aspectOf(art) : 1, level);
}

export function generateArtPuzzle(o: ArtGenerateOptions): ArtPuzzle {
  const d = dimsForArtwork(o.artworkId, o.size);
  for (let attempt = 0; attempt < 20; attempt++) {
    const rng = rngFromString(`${ART_GENERATOR_VERSION}|${o.seed}|${o.size}|${attempt}`);
    const { board, solution } = shuffleBoard(rng, o.size, d);
    const p: ArtPuzzle = { id: o.id, mode: o.mode, size: o.size, cols: d.cols, rows: d.rows, artworkId: o.artworkId, number: o.number, initial: board, solution, generatorVersion: ART_GENERATOR_VERSION };
    if (validateArtPuzzle(p)) return p;
  }
  throw new Error('ART SLIDE puzzle generation failed');
}

export { DAILY_POOL_V1, DAILY_POOL_V2_FROM, DAILY_POOL_V3_FROM, dailyArtworkId } from './dailyPick';
import { dailyArtworkId } from './dailyPick';

export const DAILY_SIZE: ArtLevel = 4;

export function generateArtDaily(dateKey: string): ArtPuzzle {
  return generateArtPuzzle({ seed: `daily|${dateKey}`, id: `artdaily-${dateKey}`, mode: 'daily', size: DAILY_SIZE, artworkId: dailyArtworkId(dateKey), number: dailyNumber(dateKey) });
}

export function generateArtFree(artworkId: string, size: ArtLevel, seed = `${Date.now()}-${Math.random()}`): ArtPuzzle {
  return generateArtPuzzle({ seed: `free|${seed}`, id: `art-${artworkId}-${size}-${seed}`, mode: 'endless', size, artworkId });
}
