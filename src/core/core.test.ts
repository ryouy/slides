import { describe, expect, it } from 'vitest';
import { blankIndex, boardFromLetters, canMove, isValidBoard, lettersOf, letterMultiset, moveTile, neighbors, tileForDirection } from './board';
import { checkRow, evaluateRow } from './wordle';
import { matchWords } from './matcher';
import { dailyNumber, generateDaily, generateEndless, goalLetters, jstDateKey, validatePuzzle } from './generator';
import { newGame, reducer, foundOf, isNoHintClear } from './game';
import { applyHint, initialCardHint, isFullyRevealed, maskedWord, totalHintUse } from './hints';
import { FOUR, THREE, poolFor } from '../data/words';
import type { Difficulty, WordEntry, WordSet } from './types';

const words: WordSet = { top: ['BIRD', 'FISH', 'TREE'], bottom: 'CAT' };
const L = (s: string) => s.replace(/\s/g, '').split('').map((c) => (c === '_' ? null : c));
const solvedLetters = L('BIRDFISHTREECAT_');

describe('board & movement', () => {
  const b = boardFromLetters(solvedLetters);
  it('has 16 cells, 15 tiles, 1 blank', () => {
    expect(isValidBoard(b)).toBe(true);
    expect(b.filter((c) => c).length).toBe(15);
    expect(blankIndex(b)).toBe(15);
  });
  it('allows only orthogonal moves into the blank', () => {
    expect(canMove(b, 14)).toBe(true);
    expect(canMove(b, 11)).toBe(true);
    expect(canMove(b, 10)).toBe(false); // diagonal
    expect(canMove(b, 12)).toBe(false); // same row, not adjacent
    expect(canMove(b, 15)).toBe(false); // the blank itself
    expect(moveTile(b, 10)).toBeNull();
  });
  it('does not wrap around rows', () => {
    expect(neighbors(3)).not.toContain(4);
    expect(neighbors(4)).not.toContain(3);
  });
  it('moves one tile and preserves the multiset', () => {
    const n = moveTile(b, 14)!;
    expect(blankIndex(n)).toBe(14);
    expect(n[15]?.letter).toBe('T');
    expect(letterMultiset(n)).toBe(letterMultiset(b));
    expect(b[15]).toBeNull(); // immutable
  });
  it('maps directions to tiles', () => {
    expect(tileForDirection(b, 'right')).toBe(14);
    expect(tileForDirection(b, 'down')).toBe(11);
    expect(tileForDirection(b, 'left')).toBeNull();
    expect(tileForDirection(b, 'up')).toBeNull();
  });
});

describe('wordle row evaluation', () => {
  it('greens, yellows, grays', () => {
    expect(evaluateRow(L('BRID'), 'BIRD')).toEqual(['green', 'yellow', 'yellow', 'green']);
    expect(evaluateRow(L('XXXX'), 'BIRD')).toEqual(['gray', 'gray', 'gray', 'gray']);
  });
  it('handles duplicate letters', () => {
    // TREE has two E's; EEET: pos2 green, one remaining E -> first E yellow, second E gray
    expect(evaluateRow(L('EEET'), 'TREE')).toEqual(['yellow', 'gray', 'green', 'yellow']);
    expect(evaluateRow(L('EEEE'), 'TREE')).toEqual(['gray', 'gray', 'green', 'green']);
    expect(evaluateRow(L('TEEE'), 'TREE')).toEqual(['green', 'gray', 'green', 'green']);
  });
  it('green takes precedence over earlier yellow for same letter', () => {
    // target FISH has one S; guess SXSX -> the S at pos 2 is green, so the earlier S is gray
    expect(evaluateRow(L('SXSX'), 'FISH')).toEqual(['gray', 'gray', 'green', 'gray']);
  });
  it('skips blanks', () => {
    expect(evaluateRow(L('B_RD'), 'BIRD')).toEqual(['green', null, 'green', 'green']);
  });
  it('bottom row beyond 3-letter word can be yellow/gray, never green', () => {
    expect(evaluateRow(L('CATT'), 'CAT')).toEqual(['green', 'green', 'green', 'gray']);
    expect(evaluateRow(L('ACTX'), 'CAT')).toEqual(['yellow', 'yellow', 'green', 'gray']);
  });
});

describe('WORDS FOUND', () => {
  it('counts completed words in any order', () => {
    expect(matchWords(solvedLetters, words).count).toBe(4);
    expect(matchWords(L('TREEBIRDFISHCAT_'), words)).toMatchObject({ count: 4, solved: true });
  });
  it('drops when a word is broken and needs no CHECK', () => {
    const r = matchWords(L('BIRDFISHTREECA_T'), words);
    expect(r.count).toBe(3);
    expect(r.solved).toBe(false);
  });
  it('does not double count the same word', () => {
    const w: WordSet = { top: ['BIRD', 'FISH', 'TREE'], bottom: 'CAT' };
    const r = matchWords(L('BIRDBIRDFISHCAT_'), w); // not a real reachable board, just logic
    expect(r.rows.slice(0, 3).filter(Boolean).length).toBe(2);
  });
  it('requires blank at bottom-right for solved', () => {
    expect(matchWords(L('BIRDFISHTREECAT_'), words).solved).toBe(true);
  });
});

const entry = (word: string, category = 'Test'): WordEntry => ({ id: word.toLowerCase(), word, category, definition: `about ${category}`, difficulty: 'easy' });
const clues = [entry('BIRD', 'Animal'), entry('FISH', 'Animal'), entry('TREE', 'Plant'), entry('CAT', 'Animal')];
const puzzle = (difficulty: Difficulty = 'normal') => ({
  id: 't', mode: 'endless' as const, difficulty, words, clues,
  letters: L('BIRDFISHTREECA_T'), solution: [15], generatorVersion: 'x', wordsVersion: 'x',
});

describe('checkRow (row vs chosen card)', () => {
  const letters = L('TREEBIRDFISHCAT_');
  it('compares only the chosen row with the chosen word', () => {
    expect(checkRow(letters, 1, 'BIRD').marks).toEqual(['green', 'green', 'green', 'green']);
    // row 0 is TREE: against FISH only E/R/T absent -> gray, with no regard to other rows
    expect(checkRow(letters, 0, 'FISH').marks).toEqual(['gray', 'gray', 'gray', 'gray']);
    expect(checkRow(letters, 0, 'BIRD').marks).toEqual(['gray', 'yellow', 'gray', 'gray']);
  });
  it('bottom row uses the left 3 cells only', () => {
    expect(checkRow(letters, 3, 'CAT')).toEqual({ cells: ['C', 'A', 'T'], marks: ['green', 'green', 'green'] });
    const odd = L('TREEBIRDFISH_CAT');
    expect(checkRow(odd, 3, 'CAT')).toEqual({ cells: [null, 'C', 'A'], marks: [null, 'yellow', 'yellow'] });
  });
  it('treats duplicate letters like Wordle', () => {
    expect(checkRow(L('EEEEXXXXXXXXXXX_'), 0, 'TREE').marks).toEqual(['gray', 'gray', 'green', 'green']);
  });
});

describe('game reducer', () => {
  it('clears on the winning move, stops the timer and blocks input', () => {
    let s = newGame(puzzle());
    expect(foundOf(s).count).toBe(3);
    s = reducer(s, { type: 'move', cell: 15 });
    expect(s.status).toBe('cleared');
    expect(s.moves).toBe(1);
    const t = s.elapsedMs;
    expect(reducer(s, { type: 'tick', ms: 500 }).elapsedMs).toBe(t);
    expect(reducer(s, { type: 'move', cell: 14 })).toBe(s);
    expect(reducer(s, { type: 'hint', card: 0, kind: 'first' })).toBe(s);
  });
  it('illegal moves change nothing; timer waits for the first action', () => {
    const s = newGame(puzzle());
    expect(reducer(s, { type: 'move', cell: 0 })).toBe(s);
    expect(reducer(s, { type: 'tick', ms: 100 }).elapsedMs).toBe(0);
    expect(reducer(reducer(s, { type: 'hint', card: 0, kind: 'first' }), { type: 'tick', ms: 100 }).elapsedMs).toBe(100);
  });
  it('selection rules pair rows 1-3 with 4-letter cards and row 4 with the 3-letter card', () => {
    let s = newGame(puzzle());
    s = reducer(s, { type: 'selRow', row: 3 });
    expect([s.selRow, s.selCard]).toEqual([3, 3]); // auto-selected
    s = reducer(s, { type: 'selCard', card: 1 });
    expect([s.selRow, s.selCard]).toEqual([null, 1]); // row 4 incompatible -> dropped
    s = reducer(s, { type: 'selRow', row: 0 });
    expect([s.selRow, s.selCard]).toEqual([0, 1]);
    s = reducer(s, { type: 'selRow', row: 0 }); // toggle off
    expect(s.selRow).toBeNull();
    s = reducer(s, { type: 'selCard', card: 3 });
    expect([s.selRow, s.selCard]).toEqual([3, 3]);
  });
  it('CHECK needs a valid pair, records row/card/cells/colours, colours only that row, move clears colours', () => {
    let s = newGame(puzzle());
    expect(reducer(s, { type: 'check' })).toBe(s); // nothing selected
    s = reducer(reducer(s, { type: 'selRow', row: 1 }), { type: 'selCard', card: 2 }); // row 2 (FISH) vs TREE
    s = reducer(s, { type: 'check' });
    expect(s.checks).toBe(1);
    expect(s.history[0]).toMatchObject({ row: 1, card: 2, cells: ['F', 'I', 'S', 'H'], marks: ['gray', 'gray', 'gray', 'gray'] });
    expect(s.marks!.slice(0, 4).every((m) => m === null)).toBe(true);
    expect(s.marks!.slice(4, 8)).toEqual(['gray', 'gray', 'gray', 'gray']);
    expect(s.marks!.slice(8).every((m) => m === null)).toBe(true);
    s = reducer(s, { type: 'move', cell: 15 });
    expect(s.marks).toBeNull();
    expect(s.history).toHaveLength(1);
    expect([s.selRow, s.selCard]).toEqual([1, 2]); // selection stays
  });
});

describe('hints', () => {
  it('starting hints depend on difficulty and are not counted', () => {
    expect(initialCardHint('easy')).toEqual({ category: true, definition: true, revealed: [] });
    expect(initialCardHint('normal')).toEqual({ category: true, definition: false, revealed: [] });
    expect(initialCardHint('hard')).toEqual({ category: false, definition: false, revealed: [] });
    const s = newGame(puzzle('easy'));
    expect(totalHintUse(s.hintUse)).toBe(0);
  });
  it('reveals in order, deterministically, without repeating', () => {
    let c = initialCardHint('hard');
    expect(applyHint(c, 'extra', 'BIRD')).toBeNull(); // needs the first letter
    c = applyHint(c, 'first', 'BIRD')!;
    expect(maskedWord('BIRD', c)).toEqual(['B', null, null, null]);
    expect(applyHint(c, 'first', 'BIRD')).toBeNull();
    c = applyHint(c, 'extra', 'BIRD')!;
    expect(maskedWord('BIRD', c)).toEqual(['B', 'I', null, null]);
    c = applyHint(c, 'extra', 'BIRD')!;
    c = applyHint(c, 'extra', 'BIRD')!;
    expect(isFullyRevealed(c, 'BIRD')).toBe(true);
    expect(applyHint(c, 'extra', 'BIRD')).toBeNull();
    expect(new Set(c.revealed).size).toBe(4);
  });
  it('category and meaning reveal once; repeats are not counted', () => {
    let s = newGame(puzzle('hard'));
    s = reducer(s, { type: 'hint', card: 0, kind: 'category' });
    s = reducer(s, { type: 'hint', card: 0, kind: 'category' });
    s = reducer(s, { type: 'hint', card: 1, kind: 'definition' });
    s = reducer(s, { type: 'hint', card: 3, kind: 'first' });
    s = reducer(s, { type: 'hint', card: 3, kind: 'first' });
    s = reducer(s, { type: 'hint', card: 3, kind: 'extra' });
    expect(s.hintUse).toEqual({ category: 1, definition: 1, first: 1, extra: 1 });
    expect(s.cards[3].revealed).toEqual([0, 1]);
    expect(s.cards[0].category && s.cards[1].definition).toBe(true);
    // on Normal, the category is free: asking for it again is a no-op
    const n = reducer(newGame(puzzle('normal')), { type: 'hint', card: 0, kind: 'category' });
    expect(n.hintUse.category).toBe(0);
  });
  it('NO HINT CLEAR requires zero hints and zero CHECKs', () => {
    const win = (s: ReturnType<typeof newGame>) => reducer(s, { type: 'move', cell: 15 });
    expect(isNoHintClear(win(newGame(puzzle())))).toBe(true);
    expect(isNoHintClear(win(reducer(newGame(puzzle()), { type: 'hint', card: 0, kind: 'first' })))).toBe(false);
    let c = reducer(reducer(newGame(puzzle()), { type: 'selRow', row: 0 }), { type: 'selCard', card: 0 });
    c = reducer(c, { type: 'check' });
    expect(isNoHintClear(win(c))).toBe(false);
    expect(isNoHintClear(newGame(puzzle()))).toBe(false); // not cleared
  });
  it('restart restores the starting hints', () => {
    let s = reducer(newGame(puzzle('hard')), { type: 'hint', card: 0, kind: 'first' });
    s = reducer(s, { type: 'restart' });
    expect(s.cards[0].revealed).toEqual([]);
    expect(totalHintUse(s.hintUse)).toBe(0);
  });
});

describe('word data', () => {
  const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
  it('has well-formed entries; definitions never contain the word', () => {
    const ids = new Set<string>();
    for (const d of diffs) {
      for (const [list, len] of [[FOUR, 4], [THREE, 3]] as const) {
        for (const e of list[d]) {
          expect(e.word).toMatch(new RegExp(`^[A-Z]{${len}}$`));
          expect(e.difficulty).toBe(d);
          expect(e.category.length).toBeGreaterThan(2);
          expect(e.definition.length).toBeGreaterThan(8);
          expect(e.definition).not.toMatch(new RegExp(`\\b${e.word}\\b`, 'i'));
          expect(ids.has(e.id)).toBe(false);
          ids.add(e.id);
        }
      }
    }
    expect(FOUR.easy.length).toBeGreaterThan(30);
    expect(poolFor(FOUR, 'hard').length).toBeGreaterThan(40);
  });
});

describe('puzzle generation', () => {
  const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
  it('always yields valid, reachable, unsolved puzzles with matching clues', () => {
    for (const d of diffs) {
      for (let i = 0; i < 60; i++) {
        const p = generateEndless(d, `seed-${d}-${i}`);
        expect(validatePuzzle(p)).toBe(true);
        expect(p.letters.filter((l) => l === null)).toHaveLength(1);
        expect(letterMultiset(p.letters)).toBe(letterMultiset(goalLetters(p.words)));
        expect(new Set(p.words.top).size).toBe(3);
        expect(matchWords(p.letters, p.words).solved).toBe(false);
        expect(p.clues.map((c) => c.word)).toEqual([...p.words.top, p.words.bottom]);
        expect(p.clues.map((c) => c.word.length)).toEqual([4, 4, 4, 3]);
        let s = newGame(p);
        for (const c of p.solution) s = reducer(s, { type: 'move', cell: c });
        expect(s.status).toBe('cleared');
        expect(foundOf(s).cards).toEqual([true, true, true, true]);
        p.clues.slice(0, 3).forEach((c) => expect(poolFor(FOUR, d).map((e) => e.word)).toContain(c.word));
        expect(poolFor(THREE, d).map((e) => e.word)).toContain(p.words.bottom);
        // every row vs its own word is fully green on the solved board
        const solvedLetters = lettersOf(s.board);
        for (let r = 0; r < 4; r++) {
          const card = p.words.top.indexOf(solvedLetters.slice(r * 4, r * 4 + 4).join(''));
          const word = r === 3 ? p.words.bottom : p.words.top[card];
          expect(checkRow(solvedLetters, r, word).marks.every((m) => m === 'green')).toBe(true);
        }
      }
    }
  });
  it('is deterministic for the same daily date, differs between dates, and has shared hint conditions', () => {
    const a = generateDaily('2026-11-13');
    expect(a).toEqual(generateDaily('2026-11-13'));
    expect(generateDaily('2026-11-14').letters).not.toEqual(a.letters);
    expect(a.number).toBe(13);
    expect(dailyNumber('2026-11-01')).toBe(1);
    // same puzzle -> same starting card state for every player
    expect(newGame(a).cards).toEqual(newGame(generateDaily('2026-11-13')).cards);
    expect(newGame(a).cards.every((c) => c.category && !c.definition && c.revealed.length === 0)).toBe(true);
  });
  it('computes the JST date key', () => {
    expect(jstDateKey(Date.parse('2026-11-12T15:00:00Z'))).toBe('2026-11-13');
    expect(jstDateKey(Date.parse('2026-11-12T14:59:59Z'))).toBe('2026-11-12');
  });
  it('scrambles start away from the finished board', () => {
    const p = generateEndless('easy', 'x');
    expect(p.letters.filter((l, i) => l !== goalLetters(p.words)[i]).length).toBeGreaterThanOrEqual(6);
  });
});

void boardFromLetters;
