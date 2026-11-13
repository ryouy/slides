import { rngFromString } from '../../../utils/rng';
import { ART_GENERATOR_VERSION, SHUFFLE_STEPS, shuffleFromBoard, type ArtPuzzle } from './generator';
import type { ArtState } from './game';

export interface ReshufflePlan {
  /** Tiles to slide, in order (cell of the tile at the moment it moves). */
  clicks: number[];
  /** The new puzzle; its initial board is exactly where the slides end. */
  puzzle: ArtPuzzle;
}

/** Removes immediate back-and-forth of the blank (x, y, x -> x): the board is the same, the path shorter. */
export function reduceBlankPath(path: number[]): number[] {
  const out: number[] = [];
  for (const v of path) {
    if (out.length >= 2 && out[out.length - 2] === v) out.pop();
    else out.push(v);
  }
  return out;
}

/**
 * Plans a SHUFFLE of the current board: a random walk of legal slides starting from what is on screen.
 * The new puzzle's `solution` is the blank's whole journey since the original scramble (scramble, the
 * moves played so far, the shuffle) with back-and-forth removed, run backwards.
 */
export function planReshuffle(state: ArtState, seed: string): ReshufflePlan {
  const n = state.puzzle.size;
  const { steps, minMisplaced } = SHUFFLE_STEPS[n];
  const rng = rngFromString(`${ART_GENERATOR_VERSION}|shuffle|${seed}|${n}`);
  const { board, clicks } = shuffleFromBoard(rng, n, state.board, steps, minMisplaced);
  const initialBlank = state.puzzle.initial.indexOf(null);
  // blank path from the SOLVED board to the old initial board (puzzle.solution is its reverse) ...
  const scramble = [...state.puzzle.solution.slice().reverse(), initialBlank];
  // ... then the player's moves (blankPath[0] is the initial blank) and the shuffle slides
  const played = (state.blankPath ?? [initialBlank]).slice(1);
  const full = reduceBlankPath([...scramble, ...played, ...clicks]);
  const puzzle: ArtPuzzle = {
    id: `art-${state.puzzle.artworkId}-${n}-${seed}`,
    mode: 'endless',
    size: n,
    artworkId: state.puzzle.artworkId,
    initial: board,
    solution: full.slice(0, -1).reverse(),
    generatorVersion: ART_GENERATOR_VERSION,
  };
  return { clicks, puzzle };
}
