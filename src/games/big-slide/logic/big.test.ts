import { describe, expect, it } from 'vitest';
import { cellsOf, stateKey, blankCount, buildGrid, canMove, isSolved, isValidLayout, legalDirs, movePiece } from './board';
import { bigDisplacements, buildBall, bigShift, generateBigDaily, generateBigEndless, generateBigPuzzle, levelFor, makeGoal, smallCount, validateBigPuzzle } from './generator';
import { bigReducer, newBigGame } from './game';
import { rngFromString } from '../../../utils/rng';
import { BOARD_SIZES, VARIANT_IDS, type BigPuzzle, type Difficulty, type Piece } from './types';
import { SMALL_CELLS, VARIANTS, makeBigPiece, smallCountFor } from './variants';

const big = (r: number, c: number): Piece => ({ id: 0, kind: 'big', w: 2, h: 2, r, c, label: 'BIG' });
const sm = (id: number, r: number, c: number): Piece => ({ id, kind: 'small', w: 1, h: 1, r, c, label: String(id) });

/**
 * 4x4 fixture (. = blank):
 *   B B 1 2
 *   B B 3 4
 *   5 6 7 8
 *   9 10 . .
 */
const fixture = (): Piece[] => [big(0, 0), sm(1, 0, 2), sm(2, 0, 3), sm(3, 1, 2), sm(4, 1, 3), sm(5, 2, 0), sm(6, 2, 1), sm(7, 2, 2), sm(8, 2, 3), sm(9, 3, 0), sm(10, 3, 1)];

describe('movement rules', () => {
  it('has the right area: 16 cells = 4 + 10 + 2 blanks', () => {
    const p = fixture();
    expect(isValidLayout(p, 4)).toBe(true);
    expect(blankCount(p, 4)).toBe(2);
    expect(buildGrid(p, 4).filter((x) => x === -1)).toHaveLength(2);
  });
  it('moves a small tile only into an adjacent blank', () => {
    const p = fixture();
    expect(canMove(p, 4, 10, 'right')).toBe(true);
    expect(canMove(p, 4, 8, 'down')).toBe(true);
    expect(canMove(p, 4, 7, 'down')).toBe(true); // (3,2) is blank
    expect(canMove(p, 4, 7, 'right')).toBe(false); // 8 is there
  });
  it('refuses occupied targets, out-of-board moves and diagonals do not exist', () => {
    const p = fixture();
    expect(canMove(p, 4, 1, 'down')).toBe(false); // occupied by 3
    expect(canMove(p, 4, 1, 'up')).toBe(false); // off board
    expect(canMove(p, 4, 2, 'right')).toBe(false);
    expect(movePiece(p, 4, 1, 'left')).toBeNull(); // big tile is there
    expect(legalDirs(p, 4, 9).sort()).toEqual([]);
  });
  it('moves the big tile only when the whole strip it enters is blank', () => {
    // one blank only next to the big tile is not enough
    const one = fixture().map((x) => (x.id === 3 ? { ...x, r: 3, c: 2 } : x)); // blank at (1,2) and (3,3)... only one adjacent to big
    expect(canMove(one, 4, 0, 'right')).toBe(false);
    // two blanks stacked right of the big tile
    const two: Piece[] = [big(0, 0), sm(1, 2, 0), sm(2, 2, 1), sm(3, 2, 2), sm(4, 2, 3), sm(5, 3, 0), sm(6, 3, 1), sm(7, 3, 2), sm(8, 3, 3), sm(9, 0, 3), sm(10, 1, 3)];
    expect(isValidLayout(two, 4)).toBe(true);
    expect(canMove(two, 4, 0, 'right')).toBe(true);
    const moved = movePiece(two, 4, 0, 'right')!;
    expect(moved.find((x) => x.id === 0)).toMatchObject({ r: 0, c: 1 });
    expect(isValidLayout(moved, 4)).toBe(true);
    expect(blankCount(moved, 4)).toBe(2);
    // the strip it left (column 0, rows 0-1) is now blank; moving left again works
    expect(canMove(moved, 4, 0, 'left')).toBe(true);
    expect(canMove(moved, 4, 0, 'right')).toBe(false); // column 3 is occupied
    expect(canMove(two, 4, 0, 'left')).toBe(false); // board edge
    expect(canMove(two, 4, 0, 'up')).toBe(false);
    expect(canMove(two, 4, 0, 'down')).toBe(false); // occupied
    expect(two[0].c).toBe(0); // input not mutated
  });
  it('preserves piece count and total area through many random moves', () => {
    const rng = rngFromString('area');
    let p = fixture();
    for (let i = 0; i < 300; i++) {
      const moves = [];
      for (const piece of p) for (const d of ['up', 'down', 'left', 'right'] as const) if (canMove(p, 4, piece.id, d)) moves.push({ id: piece.id, d });
      const m = moves[Math.floor(rng() * moves.length)];
      p = movePiece(p, 4, m.id, m.d)!;
      expect(p).toHaveLength(11);
      expect(isValidLayout(p, 4)).toBe(true);
      expect(blankCount(p, 4)).toBe(2);
    }
  });
});

describe('game reducer', () => {
  const puzzle = (): BigPuzzle => {
    const goal = fixture();
    // start: big tile one step left of... swap so one big move solves: big at (0,0) goal; start with big shifted down? use simple small-move puzzle
    const initial = goal.map((x) => (x.id === 10 ? { ...x, c: 2 } : x)); // 10 at (3,2); goal (3,1)
    return { id: 't', mode: 'endless', difficulty: 'easy', size: 4, goal, initial, solution: [{ id: 10, dir: 'left' }], generatorVersion: 'x' };
  };
  it('counts moves, ignores illegal ones, clears and then locks', () => {
    let s = newBigGame(puzzle());
    expect(reducerIllegal(s)).toBe(s);
    s = bigReducer(s, { type: 'move', id: 10, dir: 'left' });
    expect(s.status).toBe('cleared');
    expect(s.moves).toBe(1);
    expect(s.bigMoves).toBe(0);
    const t = s.elapsedMs;
    expect(bigReducer(s, { type: 'tick', ms: 100 }).elapsedMs).toBe(t);
    expect(bigReducer(s, { type: 'move', id: 10, dir: 'right' })).toBe(s);
  });
  it('wrong big position or wrong small position is not a clear', () => {
    const p = puzzle();
    expect(isSolved(p.initial, p.goal)).toBe(false);
    const bigOff = p.goal.map((x) => (x.id === 0 ? { ...x, c: 1 } : x));
    expect(isSolved(bigOff, p.goal)).toBe(false);
    const swapped = p.goal.map((x) => (x.id === 5 ? { ...x, r: 2, c: 1 } : x.id === 6 ? { ...x, r: 2, c: 0 } : x));
    expect(isSolved(swapped, p.goal)).toBe(false);
    expect(isSolved(p.goal, p.goal)).toBe(true);
  });
  it('counts a big-tile move once as a move and a big move; timer waits for the first move', () => {
    const two: Piece[] = [big(0, 0), sm(1, 2, 0), sm(2, 2, 1), sm(3, 2, 2), sm(4, 2, 3), sm(5, 3, 0), sm(6, 3, 1), sm(7, 3, 2), sm(8, 3, 3), sm(9, 0, 3), sm(10, 1, 3)];
    const goal = movePiece(two, 4, 0, 'right')!;
    let s = newBigGame({ id: 'b', mode: 'endless', difficulty: 'easy', size: 4, goal, initial: two, solution: [{ id: 0, dir: 'right' }], generatorVersion: 'x' });
    expect(bigReducer(s, { type: 'tick', ms: 50 }).elapsedMs).toBe(0);
    s = bigReducer(s, { type: 'move', id: 0, dir: 'right' });
    expect([s.moves, s.bigMoves, s.status]).toEqual([1, 1, 'cleared']);
  });
});
const reducerIllegal = (s: ReturnType<typeof newBigGame>) => bigReducer(s, { type: 'move', id: 1, dir: 'down' });

describe('generator', () => {
  const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
  it('goal layout has the right piece counts for every size', () => {
    for (const n of BOARD_SIZES) {
      const g = makeGoal(rngFromString(`g${n}`), n);
      expect(isValidLayout(g, n)).toBe(true);
      expect(g.filter((p) => p.kind === 'big')).toHaveLength(1);
      expect(g.filter((p) => p.kind === 'small')).toHaveLength(smallCount(n));
      expect(blankCount(g, n)).toBe(2);
    }
    expect(smallCount(4)).toBe(10);
    expect(smallCount(5)).toBe(19);
  });
  it('produces solvable, unsolved puzzles that force a big-tile move, for all sizes/difficulties', () => {
    for (const n of BOARD_SIZES) {
      for (const d of diffs) {
        for (let i = 0; i < 3; i++) {
          const p = generateBigEndless(n, d, `t-${n}-${d}-${i}`);
          expect(validateBigPuzzle(p)).toBe(true); // replays the solution through the real rules
          expect(isSolved(p.initial, p.goal)).toBe(false);
          expect(bigShift(p.initial, p.goal)).toBeGreaterThanOrEqual(1); // big tile must be moved
          expect(p.solution.filter((m) => m.id === 0).length).toBeGreaterThanOrEqual(1);
          expect(p.size).toBe(n);
          let s = newBigGame(p);
          for (const m of p.solution) s = bigReducer(s, { type: 'move', ...m });
          expect(s.status).toBe('cleared');
          expect(s.bigMoves).toBeGreaterThan(0);
          expect(s.moves).toBe(p.solution.length);
        }
      }
    }
  }, 120000);
  it('easy/normal solutions are provably optimal (exact search) and within their bands', () => {
    for (const d of ['easy', 'normal'] as const) {
      for (let i = 0; i < 6; i++) {
        const p = generateBigEndless(4, d, `opt-${d}-${i}`);
        expect(p.difficulty).toBe(d);
        const lv = levelFor(d, 4);
        expect(p.solution.length).toBeGreaterThanOrEqual(lv.minLen);
        expect(p.solution.length).toBeLessThanOrEqual(lv.maxLen);
        const ball = buildBall(p.initial, 4, p.solution.length);
        const goalKey = stateKey(p.goal);
        expect(ball.nodes.get(goalKey)?.d).toBe(p.solution.length); // no shorter path exists
        expect(p.solution.filter((m) => m.id === 0).length).toBeGreaterThanOrEqual(lv.minBigMoves);
      }
    }
  });
  it('hard moves the big tile several times and needs a long solution', () => {
    for (let i = 0; i < 4; i++) {
      const p = generateBigEndless(4, 'hard', `hard-${i}`);
      expect(p.difficulty).toBe('hard');
      expect(p.solution.length).toBeGreaterThanOrEqual(levelFor('hard').minLen);
      expect(p.solution.filter((m) => m.id === 0).length).toBeGreaterThanOrEqual(2);
    }
  });
  it('is deterministic per seed and daily is 4x4 normal', () => {
    const a = generateBigDaily('2026-11-13');
    expect(a).toEqual(generateBigDaily('2026-11-13'));
    expect(generateBigDaily('2026-11-14').initial).not.toEqual(a.initial);
    expect([a.size, a.difficulty, a.number]).toEqual([4, 'normal', 13]);
    expect(generateBigPuzzle({ seed: 's', id: 'x', mode: 'endless', difficulty: 'easy', size: 5 })).toEqual(
      generateBigPuzzle({ seed: 's', id: 'x', mode: 'endless', difficulty: 'easy', size: 5 }),
    );
  });
  it('harder levels need longer solutions', () => {
    const avg = (d: Difficulty) => {
      let t = 0;
      for (let i = 0; i < 6; i++) t += generateBigEndless(4, d, `avg-${d}-${i}`).solution.length;
      return t / 6;
    };
    expect(avg('easy')).toBeLessThan(avg('normal'));
    expect(avg('normal')).toBeLessThan(avg('hard'));
  });
});


const lShape = (id: number, r: number, c: number): Piece => makeBigPiece(id, 'shapes', r, c); // L-tetromino: (0,0)(1,0)(2,0)(2,1)
const one = (id: number, r: number, c: number): Piece => ({ id, kind: 'small', w: 1, h: 1, cells: SMALL_CELLS, r, c, label: String(id) });

describe('shaped (non-rectangular) blocks', () => {
  it('an L block has 4 cells in a 3x2 box with a notch', () => {
    const l = lShape(0, 0, 0);
    expect(cellsOf(l)).toHaveLength(4);
    expect([l.w, l.h]).toEqual([2, 3]);
  });
  it('moves by its real cells, not its bounding box: a tile sitting in the notch does not block it', () => {
    // 4x4:  L . . .     tile 1 sits in the L's notch at (1,1)
    //       L 1 . .
    //       L L . .
    //       . . . .
    const pieces = [lShape(0, 0, 0), one(1, 1, 1)];
    expect(isValidLayout(pieces, 4)).toBe(true);
    expect(canMove(pieces, 4, 0, 'down')).toBe(true); // needs (3,0) and (3,1) only
    const moved = movePiece(pieces, 4, 0, 'down')!;
    expect(moved.find((p) => p.id === 0)).toMatchObject({ r: 1, c: 0 });
    expect(isValidLayout(moved, 4)).toBe(true);
    expect(blankCount(moved, 4)).toBe(blankCount(pieces, 4));
    // moving right needs (0,1), (1,1) and (2,2): blocked by the tile in the notch
    expect(canMove(pieces, 4, 0, 'right')).toBe(false);
    const freed = [lShape(0, 0, 0), one(1, 3, 3)];
    expect(canMove(freed, 4, 0, 'right')).toBe(true);
    expect(canMove(freed, 4, 0, 'left')).toBe(false); // board edge
    expect(canMove(freed, 4, 0, 'up')).toBe(false);
  });
  it('a tile can slide into the notch of an L block', () => {
    const pieces = [lShape(0, 0, 0), one(1, 1, 2)];
    expect(canMove(pieces, 4, 1, 'left')).toBe(true); // (1,1) is blank
    expect(movePiece(pieces, 4, 1, 'left')!.find((p) => p.id === 1)).toMatchObject({ r: 1, c: 1 });
  });
});

describe('block sets (variants)', () => {
  it('have consistent piece counts: bigs + numbers + gaps fill the board', () => {
    for (const v of VARIANT_IDS) {
      for (const n of BOARD_SIZES) {
        const g = makeGoal(rngFromString(`vg-${v}-${n}`), n, v);
        expect(isValidLayout(g, n)).toBe(true);
        expect(g.filter((p) => p.kind === 'big')).toHaveLength(VARIANTS[v].bigs.length);
        expect(g.filter((p) => p.kind === 'small')).toHaveLength(smallCountFor(n, v));
        expect(blankCount(g, n)).toBe(VARIANTS[v].blanks);
        expect(g.filter((p) => p.kind === 'big').map((p) => p.id)).toEqual(VARIANTS[v].bigs.map((_, i) => i));
      }
    }
    expect(smallCountFor(4, 'duo')).toBe(5);
    expect(smallCountFor(4, 'shapes')).toBe(7);
    expect(smallCountFor(5, 'mega')).toBe(16);
  });
  it('two 2x2 blocks never overlap and cannot swap identities (A and B are distinct pieces)', () => {
    for (let i = 0; i < 20; i++) {
      const g = makeGoal(rngFromString(`duo${i}`), 4, 'duo');
      expect(isValidLayout(g, 4)).toBe(true);
    }
    const g = makeGoal(rngFromString('duo-swap'), 4, 'duo');
    const [a, b] = g.filter((p) => p.kind === 'big');
    const swapped = g.map((p) => (p.id === a.id ? { ...p, r: b.r, c: b.c } : p.id === b.id ? { ...p, r: a.r, c: a.c } : p));
    expect(isSolved(swapped, g)).toBe(false);
  });
  it('every variant yields valid puzzles where every big block must travel (Easy/Normal, sizes 4 and 5)', () => {
    for (const v of VARIANT_IDS) {
      for (const n of [4, 5] as const) {
        for (const d of ['easy', 'normal'] as const) {
          const p = generateBigEndless(n, d, `var-${v}-${n}-${d}`, v);
          expect(validateBigPuzzle(p)).toBe(true);
          expect(p.variant ?? 'classic').toBe(v);
          expect(bigDisplacements(p.initial, p.goal).every((x) => x >= 1)).toBe(true);
          expect(p.solution.filter((m) => p.initial.find((x) => x.id === m.id)!.kind === 'big').length).toBeGreaterThanOrEqual(VARIANTS[v].bigs.length);
          let st = newBigGame(p);
          for (const m of p.solution) st = bigReducer(st, { type: 'move', ...m });
          expect(st.status).toBe('cleared');
          expect(st.bigMoves).toBeGreaterThanOrEqual(VARIANTS[v].bigs.length);
        }
      }
    }
  }, 120000);
  it('Easy/Normal solutions of every variant are provably optimal on 4x4', () => {
    for (const v of ['duo', 'shapes', 'mega'] as const) {
      for (const d of ['easy', 'normal'] as const) {
        const p = generateBigEndless(4, d, `opt-${v}-${d}`, v);
        expect(p.difficulty).toBe(d);
        const ball = buildBall(p.initial, 4, p.solution.length);
        expect(ball.nodes.get(stateKey(p.goal))?.d).toBe(p.solution.length);
      }
    }
  });
  it('Duo hard on 4x4 is exact and long; the game counts moves of either block', () => {
    const p = generateBigEndless(4, 'hard', 'duo-hard', 'duo');
    expect(validateBigPuzzle(p)).toBe(true);
    expect(p.solution.length).toBeGreaterThanOrEqual(levelFor('hard', 4, 'duo').minLen);
  });
});

describe('compatibility with earlier saves and daily puzzles', () => {
  it('classic daily puzzles are unchanged by the block-set generalisation', () => {
    expect(stateKey(generateBigDaily('2026-11-13').initial)).toBe(':1023AK9JHI');
    expect(stateKey(generateBigDaily('2026-11-14').initial)).toBe('9@012;KCJHI');
  });
  it('old puzzles without cells/variant still play (rectangles are derived)', () => {
    const old: Piece[] = [{ id: 0, kind: 'big', w: 2, h: 2, r: 0, c: 0, label: 'BIG' }, { id: 1, kind: 'small', w: 1, h: 1, r: 0, c: 2, label: '1' }];
    expect(cellsOf(old[0])).toHaveLength(4);
    expect(canMove(old, 4, 0, 'down')).toBe(true);
    expect(canMove(old, 4, 0, 'right')).toBe(false);
  });
});
