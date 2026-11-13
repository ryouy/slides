import type { BoardSize, Piece, Variant } from './types';

type Cells = [number, number][];

/** Shapes of big blocks. They never rotate, so each orientation is its own shape. */
export const SHAPES: Record<string, Cells> = {
  /** 2x2 square */
  O: [[0, 0], [0, 1], [1, 0], [1, 1]],
  /** L-tetromino (3 tall, 2 wide) */
  L: [[0, 0], [1, 0], [2, 0], [2, 1]],
  /** T-tetromino (2 tall, 3 wide) */
  T: [[0, 0], [0, 1], [0, 2], [1, 1]],
  /** 1x2 domino */
  D: [[0, 0], [0, 1]],
  /** 2 rows x 3 columns rectangle */
  R23: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
};

export const SMALL_CELLS: Cells = [[0, 0]];

export interface VariantConfig {
  label: string;
  desc: string;
  blanks: number;
  /** Big blocks in id order (ids 0..n-1). */
  bigs: { shape: keyof typeof SHAPES; label: string }[];
}

export const VARIANTS: Record<Variant, VariantConfig> = {
  classic: { label: 'Classic', desc: 'One 2×2 BIG block, 2 gaps', blanks: 2, bigs: [{ shape: 'O', label: 'BIG' }] },
  duo: { label: 'Duo', desc: 'Two 2×2 blocks (A and B), 3 gaps', blanks: 3, bigs: [{ shape: 'O', label: 'A' }, { shape: 'O', label: 'B' }] },
  shapes: { label: 'Shapes', desc: 'An L-shaped block and a 1×2 block, 3 gaps', blanks: 3, bigs: [{ shape: 'L', label: 'L' }, { shape: 'D', label: 'D' }] },
  mega: { label: 'Mega', desc: 'One huge 2×3 block, 3 gaps', blanks: 3, bigs: [{ shape: 'R23', label: 'XL' }] },
};

export const bounds = (cells: Cells) => ({ h: Math.max(...cells.map((c) => c[0])) + 1, w: Math.max(...cells.map((c) => c[1])) + 1 });
export const bigArea = (v: Variant) => VARIANTS[v].bigs.reduce((s, b) => s + SHAPES[b.shape].length, 0);

/** Number of numbered 1x1 tiles for a board size and variant. */
export const smallCountFor = (size: BoardSize, v: Variant = 'classic') => size * size - bigArea(v) - VARIANTS[v].blanks;

export function makeBigPiece(id: number, v: Variant, r: number, c: number): Piece {
  const b = VARIANTS[v].bigs[id];
  const cells = SHAPES[b.shape];
  return { id, kind: 'big', ...bounds(cells), cells, r, c, label: b.label };
}
