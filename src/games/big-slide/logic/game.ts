import { isSolved, legalDirs, movePiece } from './board';
import type { BigDirection, BigPuzzle, Piece } from './types';

export interface BigState {
  puzzle: BigPuzzle;
  pieces: Piece[];
  moves: number;
  bigMoves: number;
  elapsedMs: number;
  started: boolean;
  status: 'playing' | 'cleared';
  /** Piece whose direction arrows are shown (when a tap is ambiguous). */
  selected: number | null;
}

export type BigAction =
  | { type: 'move'; id: number; dir: BigDirection }
  | { type: 'select'; id: number | null }
  | { type: 'restart' }
  | { type: 'tick'; ms: number };

export function newBigGame(puzzle: BigPuzzle): BigState {
  return { puzzle, pieces: puzzle.initial, moves: 0, bigMoves: 0, elapsedMs: 0, started: false, status: 'playing', selected: null };
}

export function bigReducer(s: BigState, a: BigAction): BigState {
  if (a.type === 'restart') return newBigGame(s.puzzle);
  if (s.status === 'cleared') return s;
  switch (a.type) {
    case 'tick':
      return s.started ? { ...s, elapsedMs: s.elapsedMs + a.ms } : s;
    case 'select':
      return { ...s, selected: a.id };
    case 'move': {
      const next = movePiece(s.pieces, s.puzzle.size, a.id, a.dir);
      if (!next) return s; // illegal: board unchanged, nothing counted
      const isBig = s.pieces.find((p) => p.id === a.id)!.kind === 'big';
      return {
        ...s,
        pieces: next,
        moves: s.moves + 1,
        bigMoves: s.bigMoves + (isBig ? 1 : 0),
        started: true,
        selected: null,
        status: isSolved(next, s.puzzle.goal) ? 'cleared' : 'playing',
      };
    }
  }
}

export function isValidBigState(x: unknown): x is BigState {
  const s = x as BigState;
  return (
    !!s &&
    !!s.puzzle &&
    Array.isArray(s.pieces) &&
    Array.isArray(s.puzzle.goal) &&
    [4, 5, 6].includes(s.puzzle.size) &&
    typeof s.moves === 'number' &&
    typeof s.bigMoves === 'number' &&
    typeof s.elapsedMs === 'number' &&
    (s.status === 'playing' || s.status === 'cleared')
  );
}

export { legalDirs };
