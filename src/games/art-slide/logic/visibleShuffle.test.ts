import { describe, expect, it } from 'vitest';
import { rngFromString } from '../../../utils/rng';
import { isSolved, moveTile, solvedBoard, type ArtLevel, type Dims } from './board';
import { shuffleFromBoard, visibleShuffleStepMs, visibleShuffleSteps } from './generator';

describe('visible artwork shuffle scales with actual tile count', () => {
  it.each([
    { level: 3, count: 9, moves: 23, interval: 160 },
    { level: 4, count: 16, moves: 29, interval: 150 },
    { level: 5, count: 25, moves: 38, interval: 140 },
    { level: 6, count: 36, moves: 48, interval: 130 },
    { level: 7, count: 49, moves: 61, interval: 120 },
  ])('level $level: $moves planned slides at $interval ms', ({ level, count, moves, interval }) => {
    const d: Dims = { cols: level, rows: level };
    expect(d.cols * d.rows).toBe(count);
    expect(visibleShuffleSteps(level as ArtLevel, d).steps).toBe(moves);
    expect(visibleShuffleStepMs(d)).toBe(interval);
  });

  it('uses actual tile counts for differently proportioned paintings', () => {
    const d: Dims = { cols: 9, rows: 4 };
    expect(visibleShuffleSteps(6, d).steps).toBe(48);
    expect(visibleShuffleStepMs(d)).toBe(130);
  });

  it('keeps a 9×8 shuffle visibly paced and under the maximum 25% extension', () => {
    const d: Dims = { cols: 9, rows: 8 };
    const { steps, minMisplaced } = visibleShuffleSteps(7, d);
    const interval = visibleShuffleStepMs(d);
    expect(steps).toBe(82);
    expect(interval).toBe(110);
    expect(minMisplaced).toBe(32);
    const first = solvedBoard(d);
    const { board, clicks } = shuffleFromBoard(rngFromString('large-board-test'), d, first, steps, minMisplaced);
    expect(clicks.length).toBeGreaterThanOrEqual(steps);
    expect(clicks.length).toBeLessThanOrEqual(steps + Math.ceil(steps * 0.25));
    expect(isSolved(board)).toBe(false);
    // Even the longest allowed animation is much more readable than 26ms steps.
    expect(interval).toBeGreaterThanOrEqual(110);
  });

  it('produces a legal, solvable-by-reversing, visibly shuffled board', () => {
    const d: Dims = { cols: 7, rows: 7 };
    const first = solvedBoard(d);
    const { steps, minMisplaced } = visibleShuffleSteps(7, d);
    const { board, clicks } = shuffleFromBoard(rngFromString('visible-shuffle-test'), d, first, steps, minMisplaced);
    let replay = first;
    const formerBlanks: number[] = [];
    for (const cell of clicks) {
      formerBlanks.push(replay.indexOf(null));
      const moved = moveTile(replay, d, cell);
      expect(moved).not.toBeNull();
      replay = moved!;
    }
    expect(replay).toEqual(board);
    expect(clicks.length).toBeGreaterThanOrEqual(steps);
    expect(clicks.length).toBeLessThanOrEqual(steps + Math.ceil(steps * 0.25));
    expect(isSolved(board)).toBe(false);

    // Reversing every legal slide must return to the starting arrangement.
    for (const previousBlank of formerBlanks.reverse()) {
      const undone = moveTile(replay, d, previousBlank);
      expect(undone).not.toBeNull();
      replay = undone!;
    }
    expect(replay).toEqual(first);
  });
});
