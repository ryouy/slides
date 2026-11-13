/** Difficulty level; the grid has about level² pieces (see grid.ts). */
export type ArtLevel = 3 | 4 | 5;
export const ART_LEVELS: readonly ArtLevel[] = [3, 4, 5];
export type ArtDirection = 'up' | 'down' | 'left' | 'right';

/** Columns x rows of the board. Follows the painting's proportions, so nothing is cropped. */
export interface Dims {
  cols: number;
  rows: number;
}

/** A cell holds a tile id (= the cell it belongs to when solved) or null for the single blank. */
export type ArtBoard = (number | null)[];

export const cellCount = (d: Dims) => d.cols * d.rows;

export function solvedBoard(d: Dims): ArtBoard {
  const n = cellCount(d);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? null : i));
}

export const blankIndex = (b: ArtBoard) => b.indexOf(null);

/** Solved = every tile on its home cell and the blank in the bottom-right corner. */
export function isSolved(b: ArtBoard): boolean {
  return b.every((t, i) => (i === b.length - 1 ? t === null : t === i));
}

export function neighbors(i: number, d: Dims): number[] {
  const r = Math.floor(i / d.cols);
  const c = i % d.cols;
  const out: number[] = [];
  if (r > 0) out.push(i - d.cols);
  if (r < d.rows - 1) out.push(i + d.cols);
  if (c > 0) out.push(i - 1);
  if (c < d.cols - 1) out.push(i + 1);
  return out;
}

/** Only a tile orthogonally next to the blank can move (decided from the board, not from screen positions). */
export function canMove(b: ArtBoard, d: Dims, cell: number): boolean {
  if (cell < 0 || cell >= b.length || b[cell] === null) return false;
  return neighbors(cell, d).includes(blankIndex(b));
}

export function moveTile(b: ArtBoard, d: Dims, cell: number): ArtBoard | null {
  if (!canMove(b, d, cell)) return null;
  const blank = blankIndex(b);
  const next = b.slice();
  next[blank] = b[cell];
  next[cell] = null;
  return next;
}

/** The cell of the tile that would travel in `dir` into the blank, or null. */
export function tileForDirection(b: ArtBoard, d: Dims, dir: ArtDirection): number | null {
  const blank = blankIndex(b);
  const r = Math.floor(blank / d.cols);
  const c = blank % d.cols;
  switch (dir) {
    case 'left': return c < d.cols - 1 ? blank + 1 : null;
    case 'right': return c > 0 ? blank - 1 : null;
    case 'up': return r < d.rows - 1 ? blank + d.cols : null;
    case 'down': return r > 0 ? blank - d.cols : null;
  }
}

export function isValidBoard(b: ArtBoard, d: Dims): boolean {
  if (b.length !== cellCount(d)) return false;
  if (b.filter((t) => t === null).length !== 1) return false;
  const ids = b.filter((t): t is number => t !== null).sort((x, y) => x - y);
  return ids.every((id, i) => id === i);
}

export const misplacedCount = (b: ArtBoard) => b.filter((t, i) => t !== (i === b.length - 1 ? null : i)).length;
