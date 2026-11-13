import { DELTA, DIRS, type BigDirection, type MoveRecord, type Piece } from './types';

const rectCache = new Map<string, [number, number][]>();
/** Occupied cells of a piece as offsets (the full rectangle when `cells` is omitted). */
export function cellsOf(p: Piece): [number, number][] {
  if (p.cells) return p.cells;
  const key = `${p.w}x${p.h}`;
  let c = rectCache.get(key);
  if (!c) {
    c = [];
    for (let r = 0; r < p.h; r++) for (let q = 0; q < p.w; q++) c.push([r, q]);
    rectCache.set(key, c);
  }
  return c;
}

/** Occupancy grid: piece id per cell, -1 for blank. */
export function buildGrid(pieces: readonly Piece[], n: number): Int16Array {
  const g = new Int16Array(n * n).fill(-1);
  for (const p of pieces) for (const [dr, dc] of cellsOf(p)) g[(p.r + dr) * n + p.c + dc] = p.id;
  return g;
}

/**
 * A piece may slide one cell in a direction iff every cell of its shifted shape is inside the
 * board and blank (or already part of the same piece). For a rectangle that means the newly
 * covered strip is blank; for an L or T shape the notches count too.
 */
export function canMoveOn(grid: Int16Array, n: number, p: Piece, dir: BigDirection): boolean {
  const { dr, dc } = DELTA[dir];
  for (const [r0, c0] of cellsOf(p)) {
    const r = p.r + r0 + dr;
    const c = p.c + c0 + dc;
    if (r < 0 || c < 0 || r >= n || c >= n) return false;
    const o = grid[r * n + c];
    if (o !== -1 && o !== p.id) return false;
  }
  return true;
}

export function canMove(pieces: readonly Piece[], n: number, id: number, dir: BigDirection): boolean {
  const p = pieces.find((x) => x.id === id);
  return !!p && canMoveOn(buildGrid(pieces, n), n, p, dir);
}

/** New piece list with `id` moved one cell, or null if illegal. Never mutates the input. */
export function movePiece(pieces: readonly Piece[], n: number, id: number, dir: BigDirection): Piece[] | null {
  const p = pieces.find((x) => x.id === id);
  if (!p || !canMoveOn(buildGrid(pieces, n), n, p, dir)) return null;
  const { dr, dc } = DELTA[dir];
  return pieces.map((x) => (x.id === id ? { ...x, r: x.r + dr, c: x.c + dc } : x));
}

export function legalDirs(pieces: readonly Piece[], n: number, id: number): BigDirection[] {
  const p = pieces.find((x) => x.id === id);
  if (!p) return [];
  const g = buildGrid(pieces, n);
  return DIRS.filter((d) => canMoveOn(g, n, p, d));
}

export function legalMoves(pieces: readonly Piece[], n: number): MoveRecord[] {
  const g = buildGrid(pieces, n);
  const out: MoveRecord[] = [];
  for (const p of pieces) for (const dir of DIRS) if (canMoveOn(g, n, p, dir)) out.push({ id: p.id, dir });
  return out;
}

export const blankCount = (pieces: readonly Piece[], n: number) => n * n - pieces.reduce((s, p) => s + cellsOf(p).length, 0);

/** Valid = inside the board, no overlaps. */
export function isValidLayout(pieces: readonly Piece[], n: number): boolean {
  const seen = new Set<number>();
  for (const p of pieces) {
    for (const [dr, dc] of cellsOf(p)) {
      const r = p.r + dr;
      const c = p.c + dc;
      if (r < 0 || c < 0 || r >= n || c >= n || seen.has(r * n + c)) return false;
      seen.add(r * n + c);
    }
  }
  return true;
}

/** Solved when every piece is at its own goal position. */
export function isSolved(pieces: readonly Piece[], goal: readonly Piece[]): boolean {
  return goal.every((g) => {
    const p = pieces.find((x) => x.id === g.id);
    return !!p && p.r === g.r && p.c === g.c;
  });
}

export const stateKey = (pieces: readonly Piece[]): string => {
  let k = '';
  for (const p of pieces) k += String.fromCharCode(48 + p.r * 8 + p.c);
  return k;
};

/** Sum of Manhattan displacements: a lower bound on the number of moves still needed. */
export function distanceToGoal(pieces: readonly Piece[], goal: readonly Piece[]): number {
  return goal.reduce((s, g) => {
    const p = pieces.find((x) => x.id === g.id)!;
    return s + Math.abs(p.r - g.r) + Math.abs(p.c - g.c);
  }, 0);
}

export const bigPieces = (pieces: readonly Piece[]) => pieces.filter((p) => p.kind === 'big');

/** All legal moves with their resulting layouts (one occupancy grid for the whole expansion). */
export function expand(pieces: readonly Piece[], n: number): { move: MoveRecord; state: Piece[] }[] {
  const g = buildGrid(pieces, n);
  const out: { move: MoveRecord; state: Piece[] }[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    for (const dir of DIRS) {
      if (!canMoveOn(g, n, p, dir)) continue;
      const { dr, dc } = DELTA[dir];
      const state = pieces.slice();
      state[i] = { ...p, r: p.r + dr, c: p.c + dc };
      out.push({ move: { id: p.id, dir }, state });
    }
  }
  return out;
}
