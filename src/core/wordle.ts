import { SIZE, type Mark, type WordSet } from './types';

/**
 * Wordle-style evaluation of one row against one target word.
 * Blank cells (null) are not evaluated and yield null.
 * Cells beyond the target length can never be green.
 */
export function evaluateRow(cells: readonly (string | null)[], target: string): (Mark | null)[] {
  const marks: (Mark | null)[] = cells.map(() => null);
  const remaining: Record<string, number> = {};
  // pass 1: greens
  cells.forEach((ch, i) => {
    if (ch !== null && i < target.length && target[i] === ch) marks[i] = 'green';
  });
  // count target letters not consumed by greens
  for (let i = 0; i < target.length; i++) {
    if (marks[i] !== 'green') remaining[target[i]] = (remaining[target[i]] ?? 0) + 1;
  }
  // pass 2: yellows (left to right), rest gray
  cells.forEach((ch, i) => {
    if (ch === null || marks[i] === 'green') return;
    if ((remaining[ch] ?? 0) > 0) {
      marks[i] = 'yellow';
      remaining[ch]--;
    } else {
      marks[i] = 'gray';
    }
  });
  return marks;
}

/** All 6 assignments of the 3 top words to the 3 top rows, in fixed lexicographic order. */
export const ASSIGNMENTS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

export interface BoardEvaluation {
  marks: (Mark | null)[];
  /** Chosen assignment: assignment[r] = index of the top word compared with row r. */
  assignment: readonly [number, number, number];
  greens: number;
  yellows: number;
}

const count = (marks: (Mark | null)[], m: Mark) => marks.filter((x) => x === m).length;

/**
 * Evaluate the full board. The best assignment of rows to words is chosen by
 * (1) most greens, (2) most yellows, (3) first in fixed order -> fully deterministic.
 */
export function evaluateBoard(letters: readonly (string | null)[], words: WordSet): BoardEvaluation {
  const rowCells = (r: number) => letters.slice(r * SIZE, r * SIZE + SIZE);
  const bottom = evaluateRow(rowCells(3), words.bottom);
  let best: BoardEvaluation | null = null;
  for (const assignment of ASSIGNMENTS) {
    const marks: (Mark | null)[] = [];
    for (let r = 0; r < 3; r++) marks.push(...evaluateRow(rowCells(r), words.top[assignment[r]]));
    marks.push(...bottom);
    const greens = count(marks, 'green');
    const yellows = count(marks, 'yellow');
    if (!best || greens > best.greens || (greens === best.greens && yellows > best.yellows)) {
      best = { marks, assignment, greens, yellows };
    }
  }
  return best as BoardEvaluation;
}
