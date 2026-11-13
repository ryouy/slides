import { describe, expect, it } from 'vitest';
import { blankIndex, boardFromLetters, canMove, isValidBoard, lettersOf, letterMultiset, moveTile, neighbors, tileForDirection } from './board';
import { evaluateBoard, evaluateRow } from './wordle';
import { matchWords } from './matcher';
import { dailyNumber, generateDaily, generateEndless, goalLetters, jstDateKey, validatePuzzle } from './generator';
import { newGame, reducer, foundOf } from './game';
import { FOUR, THREE, poolFor } from '../data/words';
import type { Difficulty, WordSet } from './types';

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

describe('board evaluation with free row order', () => {
  it('is fully green for any permutation of top rows', () => {
    const letters = L('TREEBIRDFISHCAT_');
    const ev = evaluateBoard(letters, words);
    expect(ev.marks.filter((m) => m === 'green').length).toBe(15);
    expect(ev.marks[15]).toBeNull();
  });
  it('picks assignment with most greens, then yellows', () => {
    const letters = L('FISHXXXXTREEXXX_');
    const ev = evaluateBoard(letters, words);
    expect(ev.assignment[0]).toBe(1);
    expect(ev.assignment[2]).toBe(2);
    expect(ev.marks.slice(0, 4)).toEqual(['green', 'green', 'green', 'green']);
  });
  it('is deterministic on ties', () => {
    const letters = L('QQQQQQQQQQQQQQQ_');
    const a = evaluateBoard(letters, words);
    const b = evaluateBoard(letters, words);
    expect(a).toEqual(b);
    expect(a.assignment).toEqual([0, 1, 2]);
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

describe('game reducer', () => {
  const puzzle = {
    id: 't', mode: 'endless' as const, difficulty: 'easy' as const, words,
    letters: L('BIRDFISHTREECA_T'), solution: [15], generatorVersion: 'x', wordsVersion: 'x',
  };
  it('clears on the winning move, stops the timer and blocks input', () => {
    let s = newGame(puzzle);
    expect(foundOf(s).count).toBe(3);
    s = reducer(s, { type: 'move', cell: 15 });
    expect(s.status).toBe('cleared');
    expect(s.moves).toBe(1);
    const t = s.elapsedMs;
    expect(reducer(s, { type: 'tick', ms: 500 }).elapsedMs).toBe(t);
    expect(reducer(s, { type: 'move', cell: 14 })).toBe(s);
    expect(reducer(s, { type: 'check' })).toBe(s);
  });
  it('check records history and colours; a move clears colours', () => {
    let s = newGame(puzzle);
    s = reducer(s, { type: 'check' });
    expect(s.checks).toBe(1);
    expect(s.history).toHaveLength(1);
    expect(s.marks).not.toBeNull();
    s = reducer(s, { type: 'dir', dir: 'right' }); // tile at blank-1 moves right
    expect(s.marks).toBeNull();
    expect(s.history).toHaveLength(1);
  });
  it('illegal moves change nothing; timer waits for first action', () => {
    let s = newGame(puzzle);
    expect(reducer(s, { type: 'move', cell: 0 })).toBe(s);
    expect(reducer(s, { type: 'tick', ms: 100 }).elapsedMs).toBe(0);
    s = reducer(s, { type: 'check' });
    expect(reducer(s, { type: 'tick', ms: 100 }).elapsedMs).toBe(100);
  });
});

describe('word data', () => {
  it('has correct lengths and no overlaps', () => {
    for (const tier of [1, 2, 3] as const) {
      FOUR[tier].forEach((w) => expect(w).toMatch(/^[A-Z]{4}$/));
      THREE[tier].forEach((w) => expect(w).toMatch(/^[A-Z]{3}$/));
    }
    const all = [1, 2, 3].flatMap((t) => FOUR[t as 1]);
    expect(new Set(all).size).toBe(all.length);
    expect(FOUR[1].length).toBeGreaterThan(60);
  });
});

describe('puzzle generation', () => {
  const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
  it('always yields valid, reachable, unsolved puzzles', () => {
    for (const d of diffs) {
      for (let i = 0; i < 60; i++) {
        const p = generateEndless(d, `seed-${d}-${i}`);
        expect(validatePuzzle(p)).toBe(true);
        expect(p.letters).toHaveLength(16);
        expect(p.letters.filter((l) => l === null)).toHaveLength(1);
        expect(letterMultiset(p.letters)).toBe(letterMultiset(goalLetters(p.words)));
        expect(new Set(p.words.top).size).toBe(3);
        expect(matchWords(p.letters, p.words).solved).toBe(false);
        // generated solution really solves it through the real game reducer
        let s = newGame(p);
        for (const c of p.solution) s = reducer(s, { type: 'move', cell: c });
        expect(s.status).toBe('cleared');
        // all words are from the right pool
        p.words.top.forEach((w) => expect(poolFor(FOUR, d)).toContain(w));
        expect(poolFor(THREE, d)).toContain(p.words.bottom);
        // Wordle check on the solved board is all green
        expect(evaluateBoard(lettersOf(s.board), p.words).marks.filter((m) => m === 'green')).toHaveLength(15);
      }
    }
  });
  it('is deterministic for the same daily date and differs between dates', () => {
    const a = generateDaily('2026-11-13');
    const b = generateDaily('2026-11-13');
    expect(a).toEqual(b);
    expect(generateDaily('2026-11-14').letters).not.toEqual(a.letters);
    expect(a.number).toBe(13);
    expect(dailyNumber('2026-11-01')).toBe(1);
  });
  it('computes the JST date key', () => {
    expect(jstDateKey(Date.parse('2026-11-12T15:00:00Z'))).toBe('2026-11-13');
    expect(jstDateKey(Date.parse('2026-11-12T14:59:59Z'))).toBe('2026-11-12');
  });
  it('scrambles start away from the finished board', () => {
    const p = generateEndless('easy', 'x');
    const misplaced = p.letters.filter((l, i) => l !== goalLetters(p.words)[i]).length;
    expect(misplaced).toBeGreaterThanOrEqual(6);
  });
});

// keep helper used
void boardFromLetters;
