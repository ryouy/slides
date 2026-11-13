export type ArtSize = 3 | 4 | 5;
export const ART_SIZES: readonly ArtSize[] = [3, 4, 5];
export type ArtDirection = 'up' | 'down' | 'left' | 'right';

/** A cell holds a tile id (= the cell it belongs to when solved) or null for the single blank. */
export type ArtBoard = (number | null)[];

export const cellCount = (n: number) => n * n;

export function solvedBoard(n: number): ArtBoard {
  return Array.from({ length: n * n }, (_, i) => (i === n * n - 1 ? null : i));
}

export const blankIndex = (b: ArtBoard) => b.indexOf(null);

/** Solved = every tile on its home cell and the blank in the bottom-right corner. */
export function isSolved(b: ArtBoard): boolean {
  return b.every((t, i) => (i === b.length - 1 ? t === null : t === i));
}

export function neighbors(i: number, n: number): number[] {
  const r = Math.floor(i / n);
  const c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

/** Only a tile orthogonally next to the blank can move (decided from the board, not from screen positions). */
export function canMove(b: ArtBoard, n: number, cell: number): boolean {
  if (cell < 0 || cell >= b.length || b[cell] === null) return false;
  return neighbors(cell, n).includes(blankIndex(b));
}

export function moveTile(b: ArtBoard, n: number, cell: number): ArtBoard | null {
  if (!canMove(b, n, cell)) return null;
  const blank = blankIndex(b);
  const next = b.slice();
  next[blank] = b[cell];
  next[cell] = null;
  return next;
}

/** The cell of the tile that would travel in `dir` into the blank, or null. */
export function tileForDirection(b: ArtBoard, n: number, dir: ArtDirection): number | null {
  const blank = blankIndex(b);
  const r = Math.floor(blank / n);
  const c = blank % n;
  switch (dir) {
    case 'left': return c < n - 1 ? blank + 1 : null;
    case 'right': return c > 0 ? blank - 1 : null;
    case 'up': return r < n - 1 ? blank + n : null;
    case 'down': return r > 0 ? blank - n : null;
  }
}

export function isValidBoard(b: ArtBoard, n: number): boolean {
  if (b.length !== n * n) return false;
  if (b.filter((t) => t === null).length !== 1) return false;
  const ids = b.filter((t): t is number => t !== null).sort((x, y) => x - y);
  return ids.every((id, i) => id === i);
}

export const misplacedCount = (b: ArtBoard) => b.filter((t, i) => t !== (i === b.length - 1 ? null : i)).length;
