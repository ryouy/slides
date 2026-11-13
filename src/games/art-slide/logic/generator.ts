import { rngFromString, pick, shuffled, type Rng } from '../../../utils/rng';
import { dailyNumber } from '../../../utils/date';
import { DAILY_POOL_V2 } from '../data/daily-pools';
import { isSolved, misplacedCount, moveTile, neighbors, solvedBoard, type ArtBoard, type ArtSize } from './board';

/** Bump when the shuffling algorithm changes (it changes which board a seed yields). */
export const ART_GENERATOR_VERSION = 'a1';

/**
 * Frozen pool for the daily puzzle. NEVER reorder or remove entries; to add artworks create a new
 * pool version (and keep this one for dates that were already published).
 */
export const DAILY_POOL_V1 = [
  'van-gogh-wheat-field-cypresses', 'hokusai-great-wave', 'monet-water-lilies', 'seurat-grande-jatte',
  'vermeer-water-pitcher', 'van-gogh-bedroom', 'degas-dance-class', 'caillebotte-paris-street',
  'cassatt-childs-bath', 'cezanne-basket-of-apples', 'toulouse-lautrec-moulin-rouge', 'renoir-two-sisters',
  'rembrandt-aristotle-homer', 'gauguin-day-of-the-god', 'monet-stacks-of-wheat', 'sargent-madame-x',
  'van-gogh-self-portrait', 'hokusai-shower-below-the-summit',
] as const;

export interface ArtPuzzle {
  id: string;
  mode: 'daily' | 'endless';
  size: ArtSize;
  artworkId: string;
  number?: number;
  initial: ArtBoard;
  /** Cells to click, in order, that solve `initial` (the generator's guarantee). */
  solution: number[];
  generatorVersion: string;
}

const STEPS: Record<ArtSize, { steps: number; minMisplaced: number }> = {
  3: { steps: 40, minMisplaced: 5 },
  4: { steps: 110, minMisplaced: 11 },
  5: { steps: 240, minMisplaced: 20 },
};

/**
 * Random walk from the solved board with legal moves only, so the result is always solvable.
 * Avoids undoing the previous move and revisiting boards.
 */
export function shuffleBoard(rng: Rng, n: ArtSize) {
  const { steps, minMisplaced } = STEPS[n];
  let board = solvedBoard(n);
  let blank = n * n - 1;
  let prev = -1;
  const visited = new Set([board.join(',')]);
  const path = [blank];
  for (let i = 0; i < steps + 400; i++) {
    if (i >= steps && misplacedCount(board) >= minMisplaced && !isSolved(board)) break;
    const options = neighbors(blank, n).filter((c) => c !== prev);
    const fresh = options.filter((c) => {
      const b = board.slice();
      b[blank] = b[c];
      b[c] = null;
      return !visited.has(b.join(','));
    });
    const next = pick(rng, fresh.length ? fresh : options);
    board = moveTile(board, n, next)!;
    visited.add(board.join(','));
    prev = blank;
    blank = next;
    path.push(blank);
  }
  // undo: click the tile that sits where the blank was before, newest first
  return { board, solution: path.slice(0, -1).reverse() };
}

export function validateArtPuzzle(p: ArtPuzzle): boolean {
  const n = p.size;
  if (p.initial.length !== n * n || p.initial.filter((t) => t === null).length !== 1) return false;
  if (isSolved(p.initial)) return false;
  let b: ArtBoard = p.initial;
  for (const c of p.solution) {
    const next = moveTile(b, n, c);
    if (!next) return false;
    b = next;
  }
  return isSolved(b);
}

export interface ArtGenerateOptions {
  seed: string;
  id: string;
  mode: 'daily' | 'endless';
  size: ArtSize;
  artworkId: string;
  number?: number;
}

export function generateArtPuzzle(o: ArtGenerateOptions): ArtPuzzle {
  for (let attempt = 0; attempt < 20; attempt++) {
    const rng = rngFromString(`${ART_GENERATOR_VERSION}|${o.seed}|${o.size}|${attempt}`);
    const { board, solution } = shuffleBoard(rng, o.size);
    const p: ArtPuzzle = { id: o.id, mode: o.mode, size: o.size, artworkId: o.artworkId, number: o.number, initial: board, solution, generatorVersion: ART_GENERATOR_VERSION };
    if (validateArtPuzzle(p)) return p;
  }
  throw new Error('ART SLIDE puzzle generation failed');
}

/** From this date on the daily artwork comes from the larger pool V2 (earlier dates keep V1 forever). */
export const DAILY_POOL_V2_FROM = '2026-11-14';

/**
 * Artwork of the day. Each pass through a pool uses its own seeded order, so every work appears once
 * per cycle. Pools are frozen constants, so published days never change when artworks are added.
 */
export function dailyArtworkId(dateKey: string): string {
  const v2 = dateKey >= DAILY_POOL_V2_FROM;
  const pool: readonly string[] = v2 ? DAILY_POOL_V2 : DAILY_POOL_V1;
  const idx = v2 ? dailyNumber(dateKey) - dailyNumber(DAILY_POOL_V2_FROM) : dailyNumber(dateKey) - 1;
  const cycle = Math.floor(idx / pool.length);
  const order = shuffled(rngFromString(`art-daily|${ART_GENERATOR_VERSION}|${v2 ? 'v2|' : ''}cycle${cycle}`), pool);
  return order[((idx % pool.length) + pool.length) % pool.length];
}

export const DAILY_SIZE: ArtSize = 4;

export function generateArtDaily(dateKey: string): ArtPuzzle {
  return generateArtPuzzle({ seed: `daily|${dateKey}`, id: `artdaily-${dateKey}`, mode: 'daily', size: DAILY_SIZE, artworkId: dailyArtworkId(dateKey), number: dailyNumber(dateKey) });
}

export function generateArtFree(artworkId: string, size: ArtSize, seed = `${Date.now()}-${Math.random()}`): ArtPuzzle {
  return generateArtPuzzle({ seed: `free|${seed}`, id: `art-${artworkId}-${size}-${seed}`, mode: 'endless', size, artworkId });
}
