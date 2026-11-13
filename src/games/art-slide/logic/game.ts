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
  /** Where the blank has been since the start (used to keep `puzzle.solution` valid after a shuffle). */
  blankPath: number[];
}

export type ArtAction =
  | { type: 'move'; cell: number }
  | { type: 'dir'; dir: ArtDirection }
  | { type: 'restart' }
  /** SHUFFLE: slide one tile as part of the shuffle (not counted, works even on a finished board). */
  | { type: 'slideStep'; cell: number }
  /** SHUFFLE finished: continue with the new puzzle (its initial board is the board now on screen). */
  | { type: 'reshuffled'; puzzle: ArtPuzzle }
  | { type: 'tick'; ms: number };

export const newArtGame = (puzzle: ArtPuzzle): ArtState => ({ puzzle, board: puzzle.initial, moves: 0, elapsedMs: 0, started: false, status: 'playing', blankPath: [puzzle.initial.indexOf(null)] });

export function artReducer(s: ArtState, a: ArtAction): ArtState {
  if (a.type === 'restart') return newArtGame(s.puzzle); // same initial arrangement
  if (a.type === 'reshuffled') return newArtGame(a.puzzle);
  if (a.type === 'slideStep') {
    const board = moveTile(s.board, s.puzzle.size, a.cell);
    if (!board) return s;
    return { ...s, board, status: 'playing', blankPath: [...(s.blankPath ?? []), a.cell] };
  }
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
      return { ...s, board, moves: s.moves + 1, started: true, status: isSolved(board) ? 'cleared' : 'playing', blankPath: [...(s.blankPath ?? []), cell] };
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
    (s.blankPath === undefined || Array.isArray(s.blankPath)) &&
    typeof s.moves === 'number' &&
    typeof s.elapsedMs === 'number' &&
    (s.status === 'playing' || s.status === 'cleared')
  );
}
