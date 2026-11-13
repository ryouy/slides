export const SIZE = 4;
export const CELLS = SIZE * SIZE;

export interface Tile {
  /** Stable identity (used for animation); equals the tile's cell index in the initial board. */
  id: number;
  letter: string;
}
export type Cell = Tile | null;
export type Board = Cell[];

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Mode = 'daily' | 'endless';
export type Mark = 'green' | 'yellow' | 'gray';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface WordSet {
  /** Three 4-letter words; the order on the board is free. */
  top: [string, string, string];
  /** 3-letter word that must sit in the left 3 cells of the bottom row. */
  bottom: string;
}

export interface Puzzle {
  id: string;
  mode: Mode;
  difficulty: Difficulty;
  /** Daily puzzle number (1-based) */
  number?: number;
  words: WordSet;
  /** Initial letters by cell index (null = blank). */
  letters: (string | null)[];
  /** Cell indices to click, in order, that solve the puzzle (generator guarantee). */
  solution: number[];
  generatorVersion: string;
  wordsVersion: string;
}
