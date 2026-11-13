import { SIZE, type WordSet } from './types';

export interface FoundResult {
  /** Per row (0..3): is that row currently a completed word? */
  rows: boolean[];
  count: number;
  solved: boolean;
}

/** Counts the words currently completed on the board (current-state value, not cumulative). */
export function matchWords(letters: readonly (string | null)[], words: WordSet): FoundResult {
  const rows = [false, false, false, false];
  const used = new Set<number>();
  for (let r = 0; r < 3; r++) {
    const cells = letters.slice(r * SIZE, r * SIZE + SIZE);
    if (cells.some((c) => c === null)) continue;
    const str = cells.join('');
    const wi = words.top.findIndex((w, i) => w === str && !used.has(i));
    if (wi >= 0) {
      used.add(wi);
      rows[r] = true;
    }
  }
  const b = letters.slice(12, 15);
  if (b.length === 3 && b.join('') === words.bottom) rows[3] = true;
  const count = rows.filter(Boolean).length;
  const solved = count === 4 && letters[15] === null;
  return { rows, count, solved };
}
