import { isSolved, isValidBoard, moveTile, tileForDirection, type ArtBoard, type ArtDirection } from './board';
import type { ArtPuzzle } from './generator';

export interface ArtState {
  puzzle: ArtPuzzle;
  board: ArtBoard;
  moves: number;
  elapsedMs: number;
  /** The timer starts at the first legal move. */
  started: boolean;
  status: 'playing' | 'cleared';
}

export type ArtAction =
  | { type: 'move'; cell: number }
  | { type: 'dir'; dir: ArtDirection }
  | { type: 'restart' }
  | { type: 'tick'; ms: number };

export const newArtGame = (puzzle: ArtPuzzle): ArtState => ({ puzzle, board: puzzle.initial, moves: 0, elapsedMs: 0, started: false, status: 'playing' });

export function artReducer(s: ArtState, a: ArtAction): ArtState {
  if (a.type === 'restart') return newArtGame(s.puzzle); // same initial arrangement
  if (s.status === 'cleared') return s; // no input after clearing
  const n = s.puzzle.size;
  switch (a.type) {
    case 'tick':
      return s.started ? { ...s, elapsedMs: s.elapsedMs + a.ms } : s;
    case 'move':
    case 'dir': {
      const cell = a.type === 'move' ? a.cell : tileForDirection(s.board, n, a.dir);
      if (cell === null) return s;
      const board = moveTile(s.board, n, cell);
      if (!board) return s; // illegal move: nothing changes, nothing is counted
      return { ...s, board, moves: s.moves + 1, started: true, status: isSolved(board) ? 'cleared' : 'playing' };
    }
  }
}

export function isValidArtState(x: unknown): x is ArtState {
  const s = x as ArtState;
  return (
    !!s &&
    !!s.puzzle &&
    [3, 4, 5].includes(s.puzzle.size) &&
    typeof s.puzzle.artworkId === 'string' &&
    Array.isArray(s.board) &&
    isValidBoard(s.board, s.puzzle.size) &&
    Array.isArray(s.puzzle.initial) &&
    typeof s.moves === 'number' &&
    typeof s.elapsedMs === 'number' &&
    (s.status === 'playing' || s.status === 'cleared')
  );
}
