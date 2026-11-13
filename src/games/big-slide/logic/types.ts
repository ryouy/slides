import type { Difficulty, Mode } from '../../../core/types';

export type { Difficulty, Mode };
export type BigDirection = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly BigDirection[] = ['up', 'down', 'left', 'right'];
export const DELTA: Record<BigDirection, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};
export const OPPOSITE: Record<BigDirection, BigDirection> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export type BoardSize = 4 | 5 | 6;
export type Variant = 'classic' | 'duo' | 'shapes' | 'mega';
export const VARIANT_IDS: readonly Variant[] = ['classic', 'duo', 'shapes', 'mega'];

export const BOARD_SIZES: readonly BoardSize[] = [4, 5, 6];

/** A piece: a 1x1 number tile, or a big block of any (possibly non-rectangular) shape. */
export interface Piece {
  /** Stable identity. Number tiles are distinct, so a piece is "home" only at its own goal cell. */
  id: number;
  kind: 'small' | 'big';
  /** Bounding box size. */
  w: number;
  h: number;
  /**
   * Occupied cells as [row, col] offsets from the top-left of the bounding box.
   * Omitted = the full w x h rectangle (older saves). Shapes never rotate.
   */
  cells?: [number, number][];
  /** Top-left of the bounding box. */
  r: number;
  c: number;
  label: string;
}

export interface MoveRecord {
  id: number;
  dir: BigDirection;
}

export interface BigPuzzle {
  id: string;
  mode: Mode;
  difficulty: Difficulty;
  size: BoardSize;
  /** Which set of big blocks is used. Omitted = 'classic' (older saves). */
  variant?: Variant;
  number?: number;
  /** Goal positions (same ids/labels as `initial`). */
  goal: Piece[];
  initial: Piece[];
  /** A legal move sequence that solves `initial` (the generator's guarantee). */
  solution: MoveRecord[];
  generatorVersion: string;
}
