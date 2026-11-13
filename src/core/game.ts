import { blankIndex, boardFromPuzzle, lettersOf, moveTile, tileForDirection } from './board';
import { applyHint, emptyHintUse, initialCardHint, type CardHint, type HintKind, type HintUse, totalHintUse } from './hints';
import { matchWords } from './matcher';
import { checkRow } from './wordle';
import type { Board, Direction, Mark, Puzzle } from './types';

/** One CHECK: a chosen board row compared with a chosen word card. */
export interface CheckEntry {
  row: number;
  card: number;
  /** The compared cells (4 for rows 1-3, 3 for the bottom row); null = blank. */
  cells: (string | null)[];
  marks: (Mark | null)[];
  found: number;
}

export interface GameState {
  puzzle: Puzzle;
  board: Board;
  moves: number;
  checks: number;
  elapsedMs: number;
  /** Timer starts on the first move, check or hint. */
  started: boolean;
  status: 'playing' | 'cleared';
  /** Colours currently shown on the board, by cell (only the checked row; cleared on the next move). */
  marks: (Mark | null)[] | null;
  history: CheckEntry[];
  cards: CardHint[];
  hintUse: HintUse;
  selRow: number | null;
  selCard: number | null;
}

export type Action =
  | { type: 'move'; cell: number }
  | { type: 'dir'; dir: Direction }
  | { type: 'check' }
  | { type: 'hint'; card: number; kind: HintKind }
  | { type: 'selRow'; row: number }
  | { type: 'selCard'; card: number }
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
    cards: puzzle.clues.map(() => initialCardHint(puzzle.difficulty)),
    hintUse: emptyHintUse(),
    selRow: null,
    selCard: null,
  };
}

export const foundOf = (s: GameState) => matchWords(lettersOf(s.board), s.puzzle.words);

/** Rows 1-3 pair with the 4-letter cards (0-2), row 4 with the 3-letter card (3). */
export const isValidPair = (row: number, card: number) => (row === 3) === (card === 3);

/** Hints used (including CHECKs); free starting hints are not counted. */
export const hintsUsed = (s: GameState) => totalHintUse(s.hintUse) + s.checks;
export const isNoHintClear = (s: GameState) => s.status === 'cleared' && hintsUsed(s) === 0;

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
    case 'selRow': {
      if (a.row < 0 || a.row > 3) return s;
      if (s.selRow === a.row) return { ...s, selRow: null };
      const selCard = a.row === 3 ? 3 : s.selCard !== null && s.selCard < 3 ? s.selCard : null;
      return { ...s, selRow: a.row, selCard };
    }
    case 'selCard': {
      if (a.card < 0 || a.card > 3) return s;
      if (s.selCard === a.card) return { ...s, selCard: null };
      const selRow = a.card === 3 ? 3 : s.selRow !== null && s.selRow < 3 ? s.selRow : null;
      return { ...s, selCard: a.card, selRow };
    }
    case 'check': {
      if (s.selRow === null || s.selCard === null || !isValidPair(s.selRow, s.selCard)) return s;
      const letters = lettersOf(s.board);
      const { cells, marks } = checkRow(letters, s.selRow, s.puzzle.clues[s.selCard].word);
      const boardMarks: (Mark | null)[] = Array(16).fill(null);
      marks.forEach((m, i) => (boardMarks[s.selRow! * 4 + i] = m));
      const entry: CheckEntry = { row: s.selRow, card: s.selCard, cells, marks, found: matchWords(letters, s.puzzle.words).count };
      return { ...s, checks: s.checks + 1, started: true, marks: boardMarks, history: [...s.history, entry] };
    }
    case 'hint': {
      const clue = s.puzzle.clues[a.card];
      if (!clue) return s;
      const next = applyHint(s.cards[a.card], a.kind, clue.word);
      if (!next) return s; // unavailable or already revealed: not counted
      const cards = s.cards.slice();
      cards[a.card] = next;
      return { ...s, cards, started: true, hintUse: { ...s.hintUse, [a.kind]: s.hintUse[a.kind] + 1 } };
    }
  }
}

/** Sanity check for restored saves (older save shapes are rejected). */
export function isValidGameState(x: unknown): x is GameState {
  const s = x as GameState;
  return (
    !!s &&
    !!s.puzzle &&
    Array.isArray(s.puzzle.clues) &&
    s.puzzle.clues.length === 4 &&
    Array.isArray(s.cards) &&
    s.cards.length === 4 &&
    !!s.hintUse &&
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
