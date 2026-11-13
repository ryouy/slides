import type { Board, WordSet } from './types';

/**
 * Extension point for a future NEXT MOVE feature.
 * An implementation must return the cell of the tile to slide next, taken from a real search
 * (e.g. IDA* / A* over reachable goal arrangements), never a mere "letter belongs that way" guess.
 * Puzzle.solution (the generator's undo path) is a valid, if unoptimised, source of moves
 * from the *initial* board only. Not implemented in this version.
 */
export interface NextMoveProvider {
  nextMove(board: Board, words: WordSet): number | null;
}
