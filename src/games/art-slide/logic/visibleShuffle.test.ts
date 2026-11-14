import { describe, expect, it } from 'vitest';
import { rngFromString } from '../../../utils/rng';
import { isSolved, moveTile, solvedBoard, type ArtLevel, type Dims } from './board';
import { shuffleFromBoard, visibleShuffleStepMs, visibleShuffleSteps } from './generator';

describe('visible artwork shuffle scales with actual tile count', () => {
  it.each([
    { level: 3, count: 9, moves: 45, interval: 60 },
    { level: 4, count: 16, moves: 80, interval: 45 },
    { level: 5, count: 25, moves: 125, interval: 36 },
    { level: 6, count: 36, moves: 180, interval: 30 },
    { level: 7, count: 49, moves: 245, interval: 26 },
  ])('level $level: $moves planned slides at $interval ms', ({ level, count, moves, interval }) => {
    const d: Dims = { cols: level, rows: level };
    expect(d.cols * d.rows).toBe(count);
    expect(visibleShuffleSteps(level as ArtLevel, d).steps).toBe(moves);
    expect(visibleShuffleStepMs(d)).toBe(interval);
  });

  it('uses actual tile counts for differently proportioned paintings', () => {
    const d: Dims = { cols: 9, rows: 4 };
    expect(visibleShuffleSteps(6, d).steps).toBe(180);
    expect(visibleShuffleStepMs(d)).toBe(30);
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
