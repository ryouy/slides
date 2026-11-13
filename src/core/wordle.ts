import { SIZE, type Mark } from './types';

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

/**
 * Compare one board row with one chosen word (the CHECK action).
 * Row 3 only compares its left 3 cells with the 3-letter word; cell 15 is never evaluated.
 */
export function checkRow(letters: readonly (string | null)[], row: number, word: string): { cells: (string | null)[]; marks: (Mark | null)[] } {
  const width = row === 3 ? 3 : SIZE;
  const cells = letters.slice(row * SIZE, row * SIZE + width);
  return { cells, marks: evaluateRow(cells, word) };
}
