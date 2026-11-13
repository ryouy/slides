import { rngFromString, randInt, type Rng } from '../../../utils/rng';
import { dailyNumber } from '../../../utils/date';
import { bigPiece, blankCount, buildGrid, canMoveOn, expand, isSolved, legalDirs, isValidLayout, legalMoves, movePiece, stateKey } from './board';
import { DIRS, OPPOSITE, type BigDirection, type BigPuzzle, type BoardSize, type Difficulty, type MoveRecord, type Mode, type Piece } from './types';

/** Bump when the generation algorithm changes (it changes which puzzle a seed yields). */
export const BIG_GENERATOR_VERSION = 'b1';

/**
 * Easy and Normal are defined by the OPTIMAL solution length, computed exactly by breadth-first search
 * (meet in the middle: balls of radius h around the start and the goal), plus how often the
 * big tile has to move.
 */
interface Level {
  /** Accepted optimal solution length (moves). */
  minLen: number;
  maxLen: number;
  /** Search radius around goal / start; certifies optimal lengths up to 2 * radius. */
  radius: number;
  /** Distance between the big tile's start and goal cells (Manhattan). */
  minBigShift: number;
  /** Big-tile moves in the optimal solution. */
  minBigMoves: number;
  /** false = the length is an upper bound from a shortened reference solution (too deep to search exactly). */
  exact: boolean;
  /** Random-walk length used for non-exact levels. */
  steps: number;
}

const LEVELS: Record<Difficulty, Level> = {
  easy: { minLen: 5, maxLen: 8, radius: 8, minBigShift: 1, minBigMoves: 1, exact: true, steps: 0 },
  normal: { minLen: 12, maxLen: 16, radius: 8, minBigShift: 1, minBigMoves: 1, exact: true, steps: 0 },
  hard: { minLen: 20, maxLen: 60, radius: 0, minBigShift: 1, minBigMoves: 2, exact: false, steps: 0 },
};

export function levelFor(difficulty: Difficulty, size: BoardSize = 4): Level {
  const l = LEVELS[difficulty];
  void size;
  return l;
}

export const smallCount = (size: BoardSize) => size * size - 4 - 2; // 1 big (4 cells) + 2 blanks

/**
 * Goal layout: the big tile sits at a random position; numbers 1..k fill the remaining cells in
 * reading order, and the last two free cells stay blank.
 */
export function makeGoal(rng: Rng, size: BoardSize): Piece[] {
  const br = randInt(rng, size - 1);
  const bc = randInt(rng, size - 1);
  const inBig = (r: number, c: number) => r >= br && r < br + 2 && c >= bc && c < bc + 2;
  const free: [number, number][] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!inBig(r, c)) free.push([r, c]);
  const pieces: Piece[] = [{ id: 0, kind: 'big', w: 2, h: 2, r: br, c: bc, label: 'BIG' }];
  free.slice(0, free.length - 2).forEach(([r, c], i) => pieces.push({ id: i + 1, kind: 'small', w: 1, h: 1, r, c, label: String(i + 1) }));
  return pieces;
}

interface Node {
  state: Piece[];
  from: string | null;
  /** Move that led here from `from`. */
  move: MoveRecord | null;
  d: number;
}
interface Ball {
  nodes: Map<string, Node>;
  layers: string[][];
}

/** Breadth-first ball of the given radius around `start` (distances are exact shortest distances). */
export function buildBall(start: Piece[], size: BoardSize, radius: number): Ball {
  const k0 = stateKey(start);
  const nodes = new Map<string, Node>([[k0, { state: start, from: null, move: null, d: 0 }]]);
  const layers: string[][] = [[k0]];
  for (let d = 1; d <= radius; d++) {
    const layer: string[] = [];
    for (const pk of layers[d - 1]) {
      const cur = nodes.get(pk)!.state;
      for (const { move, state: ns } of expand(cur, size)) {
        const k = stateKey(ns);
        if (nodes.has(k)) continue;
        nodes.set(k, { state: ns, from: pk, move, d });
        layer.push(k);
      }
    }
    layers.push(layer);
  }
  return { nodes, layers };
}

/** Moves leading from the ball's centre out to `key`. */
function pathOut(ball: Ball, key: string): MoveRecord[] {
  const out: MoveRecord[] = [];
  for (let n = ball.nodes.get(key)!; n.from !== null; n = ball.nodes.get(n.from)!) out.push(n.move!);
  return out.reverse();
}

/** Optimal solution (initial -> goal) if its length is <= 2 * radius, else null. */
export function optimalSolution(initial: Piece[], size: BoardSize, goalBall: Ball, radius: number): MoveRecord[] | null {
  const a = buildBall(initial, size, radius);
  let best: { key: string; total: number } | null = null;
  for (const [k, na] of a.nodes) {
    const nb = goalBall.nodes.get(k);
    if (nb && (!best || na.d + nb.d < best.total)) best = { key: k, total: na.d + nb.d };
  }
  if (!best) return null;
  const forward = pathOut(a, best.key);
  // goal ball moves go goal -> key; walking back key -> goal applies the opposite moves in reverse order
  const back = pathOut(goalBall, best.key).reverse().map((m) => ({ id: m.id, dir: OPPOSITE[m.dir] }));
  return [...forward, ...back];
}

export function bigShift(pieces: readonly Piece[], goal: readonly Piece[]): number {
  const a = bigPiece(pieces);
  const b = bigPiece(goal);
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function meetsLevel(initial: Piece[], goal: Piece[], solution: MoveRecord[], level: Level): boolean {
  return (
    !isSolved(initial, goal) &&
    solution.length >= level.minLen &&
    solution.length <= level.maxLen &&
    bigShift(initial, goal) >= level.minBigShift &&
    solution.filter((m) => m.id === 0).length >= level.minBigMoves
  );
}

/** Replays the stored solution through the real move rules. */
export function validateBigPuzzle(p: BigPuzzle): boolean {
  const n = p.size;
  if (!isValidLayout(p.initial, n) || !isValidLayout(p.goal, n)) return false;
  if (blankCount(p.initial, n) !== 2 || p.initial.length !== smallCount(n) + 1) return false;
  if (isSolved(p.initial, p.goal)) return false;
  if (bigShift(p.initial, p.goal) < 1) return false; // the big tile must have to move
  let cur: Piece[] = p.initial;
  for (const m of p.solution) {
    const next = movePiece(cur, n, m.id, m.dir);
    if (!next) return false;
    cur = next;
  }
  return isSolved(cur, p.goal);
}

export interface BigGenerateOptions {
  seed: string;
  id: string;
  mode: Mode;
  difficulty: Difficulty;
  size: BoardSize;
  number?: number;
}

/**
 * Scramble that is guaranteed to move the big tile several times: repeatedly walk (by shortest
 * paths) to a layout where the big tile can slide, slide it, and continue. Returns the visited
 * states from the goal to the scrambled board.
 */
function bigChain(rng: Rng, goal: Piece[], size: BoardSize, bigMoves: number): Piece[][] {
  let cur = goal;
  const states: Piece[][] = [goal];
  let lastBig: BigDirection | null = null;
  for (let k = 0; k < bigMoves; k++) {
    const ball = buildBall(cur, size, 7);
    const options: { key: string; dir: BigDirection }[] = [];
    for (let d = 0; d < ball.layers.length && options.length < 6; d++) {
      for (const key of ball.layers[d]) {
        const st = ball.nodes.get(key)!.state;
        for (const dir of legalDirs(st, size, 0)) if (!(lastBig && dir === OPPOSITE[lastBig])) options.push({ key, dir });
      }
    }
    if (!options.length) break;
    const o = options[randInt(rng, options.length)];
    for (const m of pathOut(ball, o.key)) {
      cur = movePiece(cur, size, m.id, m.dir)!;
      states.push(cur);
    }
    cur = movePiece(cur, size, 0, o.dir)!;
    states.push(cur);
    lastBig = o.dir;
  }
  return states;
}

/**
 * Shortens a solution path by local breadth-first search: from each state, jump to the furthest
 * later state of the path reachable within `depth` moves. The result is still a legal solution.
 */
export function shortenPath(states: Piece[][], moves: MoveRecord[], size: BoardSize, depth = 7) {
  let st = states;
  let mv = moves;
  for (let pass = 0; pass < 4; pass++) {
    const idx = new Map(st.map((x, i) => [stateKey(x), i]));
    const outStates: Piece[][] = [st[0]];
    const outMoves: MoveRecord[] = [];
    let i = 0;
    while (i < st.length - 1) {
      const startKey = stateKey(st[i]);
      const parent = new Map<string, { from: string; move: MoveRecord; state: Piece[] } | null>([[startKey, null]]);
      let frontier = [st[i]];
      let bestJ = i + 1;
      let bestKey: string | null = null;
      for (let d = 0; d < depth && frontier.length; d++) {
        const next: Piece[][] = [];
        for (const cur of frontier) {
          const ck = stateKey(cur);
          for (const { move, state } of expand(cur, size)) {
            const k = stateKey(state);
            if (parent.has(k)) continue;
            parent.set(k, { from: ck, move, state });
            const j = idx.get(k);
            if (j !== undefined && j > bestJ) {
              bestJ = j;
              bestKey = k;
            }
            next.push(state);
          }
        }
        frontier = next;
      }
      if (bestKey === null) {
        outStates.push(st[i + 1]);
        outMoves.push(mv[i]);
        i++;
      } else {
        const chain: { move: MoveRecord; state: Piece[] }[] = [];
        for (let k: string = bestKey; k !== startKey; ) {
          const e = parent.get(k)!;
          chain.push({ move: e.move, state: e.state });
          k = e.from;
        }
        for (const c of chain.reverse()) {
          outMoves.push(c.move);
          outStates.push(c.state);
        }
        i = bestJ;
      }
    }
    const improved = outMoves.length < mv.length;
    st = outStates;
    mv = outMoves;
    if (!improved) break;
  }
  return { states: st, moves: mv };
}

const bigMovesIn = (moves: readonly MoveRecord[]) => moves.filter((m) => m.id === 0).length;
const reverseMoves = (moves: MoveRecord[]): MoveRecord[] => moves.map((m) => ({ id: m.id, dir: OPPOSITE[m.dir] })).reverse();

function tryGenerate(o: BigGenerateOptions): BigPuzzle | null {
  const level = levelFor(o.difficulty, o.size);
  const attempts = level.exact ? 12 : 8;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const rng = rngFromString(`${BIG_GENERATOR_VERSION}|${o.seed}|${o.size}|${o.difficulty}|${attempt}`);
    const goal = makeGoal(rng, o.size);
    const ball = level.exact ? buildBall(goal, o.size, level.radius) : { nodes: new Map(), layers: [] as string[][] };
    const make = (initial: Piece[], solution: MoveRecord[]): BigPuzzle | null => {
      if (!meetsLevel(initial, goal, solution, level)) return null;
      const puzzle: BigPuzzle = { id: o.id, mode: o.mode, difficulty: o.difficulty, size: o.size, number: o.number, goal, initial, solution, generatorVersion: BIG_GENERATOR_VERSION };
      return validateBigPuzzle(puzzle) ? puzzle : null;
    };
    if (!level.exact) {
      // hard: too deep to search exactly; use a walk biased to the big tile, shortened to a near-optimal reference
      for (let t = 0; t < 3; t++) {
        const states = bigChain(rng, goal, o.size, 5 + randInt(rng, 3)).reverse();
        const raw: MoveRecord[] = [];
        for (let i = 0; i < states.length - 1; i++) raw.push(moveBetween(states[i], states[i + 1], o.size));
        const { states: st, moves } = shortenPath(states, raw, o.size);
        const p = make(st[0], moves);
        if (p) return p;
      }
    } else if (o.difficulty === 'easy') {
      // easy: take a start straight from the goal ball, where distances are exact by construction
      const keys = ball.layers.slice(level.minLen, level.maxLen + 1).flat().filter((k) => bigMovesIn(pathOut(ball, k)) >= level.minBigMoves);
      for (let t = 0; t < 30 && keys.length; t++) {
        const k = keys[randInt(rng, keys.length)];
        const p = make(ball.nodes.get(k)!.state, reverseMoves(pathOut(ball, k)));
        if (p) return p;
      }
    } else {
      // normal/hard: start from a far state that already needs the big tile, drift a few small-tile
      // steps further away, and measure the exact optimal length by meeting in the middle
      const far = ball.layers[level.radius].filter((k) => bigMovesIn(pathOut(ball, k)) >= level.minBigMoves);
      for (let t = 0; t < 8 && far.length; t++) {
        let cur = ball.nodes.get(far[randInt(rng, far.length)])!.state;
        let last: MoveRecord | null = null;
        const extra = level.minLen - level.radius + randInt(rng, level.maxLen - level.minLen - (level.minLen - level.radius) + 2);
        for (let i = 0; i < extra; i++) {
          const opts = legalMoves(cur, o.size).filter((m) => m.id !== 0 && !(last && m.id === last.id && m.dir === OPPOSITE[last.dir]));
          if (!opts.length) break;
          const m = opts[randInt(rng, opts.length)];
          cur = movePiece(cur, o.size, m.id, m.dir)!;
          last = m;
        }
        const sol = optimalSolution(cur, o.size, ball, level.radius);
        const p = sol && make(cur, sol);
        if (p) return p;
      }
    }
  }
  return null;
}

/** Generates a puzzle; in the (very unlikely) case a level cannot be met, falls back to the next easier one. */
export function generateBigPuzzle(o: BigGenerateOptions): BigPuzzle {
  const order: Difficulty[] = o.difficulty === 'hard' ? ['hard', 'normal', 'easy'] : o.difficulty === 'normal' ? ['normal', 'easy'] : ['easy'];
  for (const difficulty of order) {
    const p = tryGenerate({ ...o, difficulty });
    if (p) return p;
  }
  throw new Error('BIG SLIDE puzzle generation failed');
}

/** The single legal move that turns state `a` into state `b`. */
function moveBetween(a: Piece[], b: Piece[], size: BoardSize): MoveRecord {
  const kb = stateKey(b);
  for (const e of expand(a, size)) if (stateKey(e.state) === kb) return e.move;
  throw new Error('states are not adjacent');
}

export function generateBigDaily(dateKey: string): BigPuzzle {
  return generateBigPuzzle({ seed: `daily|${dateKey}`, id: `bigdaily-${dateKey}`, mode: 'daily', difficulty: 'normal', size: 4, number: dailyNumber(dateKey) });
}

export function generateBigEndless(size: BoardSize, difficulty: Difficulty, seed = `${Date.now()}-${Math.random()}`): BigPuzzle {
  return generateBigPuzzle({ seed: `endless|${seed}`, id: `bigendless-${seed}`, mode: 'endless', difficulty, size });
}

// re-exported for tests
export { buildGrid, canMoveOn, DIRS };
