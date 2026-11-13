import { blankIndex, boardFromPuzzle, lettersOf, moveTile, tileForDirection } from './board';
import { matchWords } from './matcher';
import { evaluateBoard } from './wordle';
import type { Board, Direction, Mark, Puzzle } from './types';

export interface CheckEntry {
  letters: (string | null)[];
  marks: (Mark | null)[];
  found: number;
}

export interface GameState {
  puzzle: Puzzle;
  board: Board;
  moves: number;
  checks: number;
  elapsedMs: number;
  /** Timer starts on the first move or check. */
  started: boolean;
  status: 'playing' | 'cleared';
  /** Colours currently shown on the board (cleared on the next move). */
  marks: (Mark | null)[] | null;
  history: CheckEntry[];
}

export type Action =
  | { type: 'move'; cell: number }
  | { type: 'dir'; dir: Direction }
  | { type: 'check' }
  | { type: 'restart' }
  | { type: 'tick'; ms: number };

export function newGame(puzzle: Puzzle): GameState {
  return {
    puzzle,
    board: boardFromPuzzle(puzzle),
    moves: 0,
    checks: 0,
    elapsedMs: 0,
    started: false,
    status: 'playing',
    marks: null,
    history: [],
  };
}

export const foundOf = (s: GameState) => matchWords(lettersOf(s.board), s.puzzle.words);

export function reducer(s: GameState, a: Action): GameState {
  if (a.type === 'restart') return newGame(s.puzzle);
  if (s.status === 'cleared') return s; // no input after clearing
  switch (a.type) {
    case 'tick':
      return s.started ? { ...s, elapsedMs: s.elapsedMs + a.ms } : s;
    case 'move':
    case 'dir': {
      const cell = a.type === 'move' ? a.cell : tileForDirection(s.board, a.dir);
      if (cell === null) return s;
      const board = moveTile(s.board, cell);
      if (!board) return s;
      const solved = matchWords(lettersOf(board), s.puzzle.words).solved;
      return { ...s, board, moves: s.moves + 1, started: true, marks: null, status: solved ? 'cleared' : 'playing' };
    }
    case 'check': {
      const letters = lettersOf(s.board);
      const ev = evaluateBoard(letters, s.puzzle.words);
      const entry: CheckEntry = { letters, marks: ev.marks, found: matchWords(letters, s.puzzle.words).count };
      return { ...s, checks: s.checks + 1, started: true, marks: ev.marks, history: [...s.history, entry] };
    }
  }
}

/** Sanity check for restored saves. */
export function isValidGameState(x: unknown): x is GameState {
  const s = x as GameState;
  return (
    !!s &&
    !!s.puzzle &&
    Array.isArray(s.board) &&
    s.board.length === 16 &&
    s.board.filter((c) => c === null).length === 1 &&
    blankIndex(s.board) >= 0 &&
    typeof s.moves === 'number' &&
    typeof s.checks === 'number' &&
    typeof s.elapsedMs === 'number' &&
    Array.isArray(s.history) &&
    (s.status === 'playing' || s.status === 'cleared')
  );
}
