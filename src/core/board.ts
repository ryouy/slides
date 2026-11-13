import { CELLS, SIZE, type Board, type Direction, type Puzzle } from './types';

export const row = (i: number) => Math.floor(i / SIZE);
export const col = (i: number) => i % SIZE;

export function boardFromLetters(letters: (string | null)[]): Board {
  return letters.map((l, i) => (l === null ? null : { id: i, letter: l }));
}

export function boardFromPuzzle(p: Puzzle): Board {
  return boardFromLetters(p.letters);
}

export const lettersOf = (b: Board): (string | null)[] => b.map((c) => (c ? c.letter : null));

export function blankIndex(b: Board): number {
  return b.findIndex((c) => c === null);
}

/** Orthogonal neighbours of a cell (no diagonals, no wrap-around). */
export function neighbors(i: number): number[] {
  const r = row(i);
  const c = col(i);
  const out: number[] = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
}

export function canMove(b: Board, idx: number): boolean {
  if (idx < 0 || idx >= CELLS || b[idx] === null) return false;
  return neighbors(idx).includes(blankIndex(b));
}

/** Slide the tile at `idx` into the blank. Returns a new board, or null if illegal. */
export function moveTile(b: Board, idx: number): Board | null {
  if (!canMove(b, idx)) return null;
  const blank = blankIndex(b);
  const next = b.slice();
  next[blank] = b[idx];
  next[idx] = null;
  return next;
}

/** Cell of the tile that would move in direction `dir` (the direction the tile travels). */
export function tileForDirection(b: Board, dir: Direction): number | null {
  const blank = blankIndex(b);
  const r = row(blank);
  const c = col(blank);
  switch (dir) {
    case 'left':
      return c < SIZE - 1 ? blank + 1 : null;
    case 'right':
      return c > 0 ? blank - 1 : null;
    case 'up':
      return r < SIZE - 1 ? blank + SIZE : null;
    case 'down':
      return r > 0 ? blank - SIZE : null;
  }
}

export function isValidBoard(b: Board): boolean {
  if (b.length !== CELLS) return false;
  const blanks = b.filter((c) => c === null).length;
  if (blanks !== 1) return false;
  return b.every((c) => c === null || (typeof c.letter === 'string' && c.letter.length === 1));
}

export function letterMultiset(b: Board | (string | null)[]): string {
  return (b as (string | { letter: string } | null)[])
    .map((c) => (c === null ? '' : typeof c === 'string' ? c : c.letter))
    .sort()
    .join('');
}
