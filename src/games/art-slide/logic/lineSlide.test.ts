import { describe, expect, it } from 'vitest';
import { isSolved, isValidBoard, lineSlideCells, moveTile, solvedBoard, type Dims } from './board';
import { artReducer, newArtGame } from './game';
import { generateArtFree } from './generator';

describe('multi-tile straight-line sliding', () => {
  it('slides the two right-column tiles down one-by-one when top-right is tapped', () => {
    const d: Dims = { cols: 3, rows: 3 };
    const start = solvedBoard(d);
    const cells = lineSlideCells(start, d, 2);
    expect(cells).toEqual([5, 2]);
    let board = start;
    for (const cell of cells) {
      const moved = moveTile(board, d, cell);
      expect(moved).not.toBeNull();
      board = moved!;
    }
    expect(board).toEqual([0, 1, null, 3, 4, 2, 6, 7, 5]);
    expect(isValidBoard(board, d)).toBe(true);
    expect(isSolved(board)).toBe(false);
  });

  it('slides a whole row horizontally using legal one-cell moves', () => {
    const d: Dims = { cols: 3, rows: 3 };
    const start = solvedBoard(d);
    expect(lineSlideCells(start, d, 6)).toEqual([7, 6]);
    let board = start;
    for (const cell of lineSlideCells(start, d, 6)) board = moveTile(board, d, cell)!;
    expect(board).toEqual([0, 1, 2, 3, 4, 5, null, 6, 7]);
  });

  it('rejects diagonal, out-of-range, and blank clicks', () => {
    const d: Dims = { cols: 3, rows: 3 };
    const b = solvedBoard(d);
    expect(lineSlideCells(b, d, 0)).toEqual([]);
    expect(lineSlideCells(b, d, 8)).toEqual([]);
    expect(lineSlideCells(b, d, -1)).toEqual([]);
    expect(lineSlideCells(b, d, 9)).toEqual([]);
  });

  it('supports non-square paintings without crossing row boundaries', () => {
    const d: Dims = { cols: 4, rows: 3 };
    const b = solvedBoard(d);
    expect(lineSlideCells(b, d, 3)).toEqual([7, 3]);
    expect(lineSlideCells(b, d, 8)).toEqual([10, 9, 8]);
    expect(lineSlideCells(b, d, 4)).toEqual([]);
  });

  it('updates all aligned tiles atomically, counts each, and preserves the blank path', () => {
    const puzzle = generateArtFree('not-an-artwork', 3, 'line-slide-test');
    const initial = newArtGame(puzzle);
    // Start from a known solvable position so the demonstration is reproducible.
    const first = { ...initial, board: solvedBoard({ cols: 3, rows: 3 }), blankPath: [8] };
    const after = artReducer(first, { type: 'lineMove', cell: 2 });
    expect(after.moves).toBe(2);
    expect(after.started).toBe(true);
    expect(after.blankPath).toEqual([8, 5, 2]);
    expect(after.board).toEqual([0, 1, null, 3, 4, 2, 6, 7, 5]);

    // One action returns the final positions immediately, so the two DOM tiles
    // receive new positions in the same React render/CSS transition.
    const back = artReducer(after, { type: 'lineMove', cell: 8 });
    expect(back.board).toEqual(first.board);
    expect(back.moves).toBe(4);
    expect(back.blankPath).toEqual([8, 5, 2, 5, 8]);
  });
});
