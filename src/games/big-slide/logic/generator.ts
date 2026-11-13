import { rngFromString, randInt, type Rng } from '../../../utils/rng';
import { dailyNumber } from '../../../utils/date';
import { bigPieces, blankCount, buildGrid, canMoveOn, expand, isSolved, legalDirs, isValidLayout, legalMoves, movePiece, stateKey } from './board';
import { DELTA, DIRS, OPPOSITE, type BigDirection, type BigPuzzle, type BoardSize, type Difficulty, type MoveRecord, type Mode, type Piece, type Variant } from './types';
import { SMALL_CELLS, VARIANTS, makeBigPiece, smallCountFor } from './variants';

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

const MAX_BALL_NODES = 15000;

export function levelFor(difficulty: Difficulty, size: BoardSize = 4, variant: Variant = 'classic'): Level {
  const l = LEVELS[difficulty];
  if (variant === 'classic') return l;
  // gappier, jammed layouts: tuned bands (Shapes boards are small mazes, so their bands are shorter)
  const bigs = VARIANTS[variant].bigs.length;
  const minBigMoves = Math.max(l.minBigMoves, bigs);
  const bands: Record<Exclude<Variant, 'classic'>, { easy: [number, number]; normal: [number, number]; hard: number }> = {
    duo: { easy: [4, 8], normal: [10, 16], hard: 18 },
    shapes: { easy: [4, 7], normal: [8, 11], hard: 12 },
    mega: { easy: [4, 8], normal: [10, 15], hard: 16 },
  };
  const b = bands[variant];
  if (difficulty === 'easy') return { ...l, minLen: b.easy[0], maxLen: b.easy[1], radius: b.easy[1], minBigMoves };
  if (difficulty === 'normal') return { ...l, minLen: b.normal[0], maxLen: b.normal[1], radius: 8, minBigMoves };
  // hard: exact search where the state space allows it (4x4 Duo/Mega), else a big-block scramble with a shortened reference solution
  if (size === 4 && variant !== 'shapes') return { ...l, exact: true, minLen: b.hard, maxLen: 24, radius: 12, minBigMoves: Math.max(3, minBigMoves) };
  return { ...l, minLen: variant === 'shapes' ? b.hard : b.hard - 4, minBigMoves: Math.max(3, minBigMoves) };
}

export const smallCount = (size: BoardSize, variant: Variant = 'classic') => smallCountFor(size, variant);

/**
 * Goal layout: the big blocks are placed at random non-overlapping positions; numbers 1..k then fill
 * the remaining cells in reading order, and the last free cells stay blank.
 */
export function makeGoal(rng: Rng, size: BoardSize, variant: Variant = 'classic'): Piece[] {
  const cfg = VARIANTS[variant];
  // place the big blocks; if one cannot fit (e.g. a 2x2 block in the middle of a 4x4 board), start over
  let pieces: Piece[] = [];
  let taken = new Set<number>();
  for (let restart = 0; restart < 100; restart++) {
    pieces = [];
    taken = new Set<number>();
    let ok = true;
    for (let id = 0; id < cfg.bigs.length && ok; id++) {
      ok = false;
      for (let attempt = 0; attempt < 60 && !ok; attempt++) {
        const probe = makeBigPiece(id, variant, 0, 0);
        const r = randInt(rng, size - probe.h + 1);
        const c = randInt(rng, size - probe.w + 1);
        const cand = makeBigPiece(id, variant, r, c);
        const cells = cand.cells!.map(([dr, dc]) => (r + dr) * size + c + dc);
        if (cells.some((k) => taken.has(k))) continue;
        cells.forEach((k) => taken.add(k));
        pieces.push(cand);
        ok = true;
      }
    }
    if (ok) break;
    if (restart === 99) throw new Error('could not place big blocks');
  }
  const free: [number, number][] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!taken.has(r * size + c)) free.push([r, c]);
  const base = cfg.bigs.length;
  free.slice(0, free.length - cfg.blanks).forEach(([r, c], i) => pieces.push({ id: base + i, kind: 'small', w: 1, h: 1, cells: SMALL_CELLS, r, c, label: String(i + 1) }));
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
  /** Completed radius: every state within this distance is in `nodes` (can be below the requested radius when the node budget ran out). */
  radius: number;
}

/** Breadth-first ball of the given radius around `start` (distances are exact shortest distances). */
export function buildBall(start: Piece[], size: BoardSize, radius: number, maxNodes = Infinity): Ball {
  const k0 = stateKey(start);
  const nodes = new Map<string, Node>([[k0, { state: start, from: null, move: null, d: 0 }]]);
  const layers: string[][] = [[k0]];
  let done = 0;
  for (let d = 1; d <= radius; d++) {
    if (nodes.size > maxNodes) break;
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
    done = d;
  }
  return { nodes, layers, radius: done };
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

/** Manhattan distance between each big block's start and goal position. */
export function bigDisplacements(pieces: readonly Piece[], goal: readonly Piece[]): number[] {
  return bigPieces(goal).map((g) => {
    const p = pieces.find((x) => x.id === g.id)!;
    return Math.abs(p.r - g.r) + Math.abs(p.c - g.c);
  });
}
/** Total displacement of all big blocks. */
export const bigShift = (pieces: readonly Piece[], goal: readonly Piece[]) => bigDisplacements(pieces, goal).reduce((a, b) => a + b, 0);

const bigIdsOf = (goal: readonly Piece[]) => new Set(bigPieces(goal).map((p) => p.id));
const countBig = (moves: readonly MoveRecord[], bigIds: Set<number>) => moves.filter((m) => bigIds.has(m.id)).length;

function meetsLevel(initial: Piece[], goal: Piece[], solution: MoveRecord[], level: Level): boolean {
  return (
    !isSolved(initial, goal) &&
    solution.length >= level.minLen &&
    solution.length <= level.maxLen &&
    bigDisplacements(initial, goal).every((d) => d >= 1) && // every big block has to travel
    bigShift(initial, goal) >= level.minBigShift &&
    countBig(solution, bigIdsOf(goal)) >= level.minBigMoves
  );
}

/** Replays the stored solution through the real move rules. */
export function validateBigPuzzle(p: BigPuzzle): boolean {
  const n = p.size;
  if (!isValidLayout(p.initial, n) || !isValidLayout(p.goal, n)) return false;
  const v = p.variant ?? 'classic';
  if (blankCount(p.initial, n) !== VARIANTS[v].blanks || p.initial.length !== smallCount(n, v) + VARIANTS[v].bigs.length) return false;
  if (isSolved(p.initial, p.goal)) return false;
  if (bigDisplacements(p.initial, p.goal).some((d) => d < 1)) return false; // every big block must have to move
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
  /** Omitted = classic. */
  variant?: Variant;
  number?: number;
}

/**
 * Scramble that is guaranteed to move the big tile several times: repeatedly walk (by shortest
 * paths) to a layout where the big tile can slide, slide it, and continue. Returns the visited
 * states from the goal to the scrambled board.
 */
export function bigChain(rng: Rng, goal: Piece[], size: BoardSize, bigMoves: number, radius = 7): Piece[][] {
  let cur = goal;
  const states: Piece[][] = [goal];
  let lastBig: { id: number; dir: BigDirection } | null = null;
  const bigIds = [...bigIdsOf(goal)];
  for (let k = 0; k < bigMoves; k++) {
    const ball = buildBall(cur, size, radius);
    const options: { key: string; id: number; dir: BigDirection; away: boolean }[] = [];
    for (let d = 0; d < ball.layers.length && options.length < 6; d++) {
      for (const key of ball.layers[d]) {
        const st = ball.nodes.get(key)!.state;
        for (const id of bigIds) {
          const p = st.find((x) => x.id === id)!;
          const g = goal.find((x) => x.id === id)!;
          for (const dir of legalDirs(st, size, id)) {
            if (lastBig && lastBig.id === id && dir === OPPOSITE[lastBig.dir]) continue;
            const { dr, dc } = DELTA[dir];
            // prefer moves that carry the block further from its goal cell, so the blocks really travel
            const away = Math.abs(p.r + dr - g.r) + Math.abs(p.c + dc - g.c) > Math.abs(p.r - g.r) + Math.abs(p.c - g.c);
            options.push({ key, id, dir, away });
          }
        }
      }
    }
    if (!options.length) break;
    const aways = options.filter((x) => x.away);
    const pool = aways.length ? aways : options;
    const o = pool[randInt(rng, pool.length)];
    for (const m of pathOut(ball, o.key)) {
      cur = movePiece(cur, size, m.id, m.dir)!;
      states.push(cur);
    }
    cur = movePiece(cur, size, o.id, o.dir)!;
    states.push(cur);
    lastBig = { id: o.id, dir: o.dir };
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

const reverseMoves = (moves: MoveRecord[]): MoveRecord[] => moves.map((m) => ({ id: m.id, dir: OPPOSITE[m.dir] })).reverse();

function tryGenerate(o: BigGenerateOptions, deadline = Infinity): BigPuzzle | null {
  const variant = o.variant ?? 'classic';
  const level = levelFor(o.difficulty, o.size, variant);
  const classic = variant === 'classic';
  const attempts = classic ? (level.exact ? 12 : 8) : level.exact ? 40 : 12;
  const budget = classic ? Infinity : MAX_BALL_NODES;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!classic && attempt > 0 && Date.now() > deadline) break; // keep generation snappy; the caller falls back
    const rng = rngFromString(`${BIG_GENERATOR_VERSION}|${o.seed}|${o.size}|${o.difficulty}|${attempt}${classic ? '' : `|${variant}`}`);
    const goal = makeGoal(rng, o.size, variant);
    const bigIds = bigIdsOf(goal);
    const ball: Ball = level.exact ? buildBall(goal, o.size, level.radius, budget) : { nodes: new Map(), layers: [], radius: 0 };
    const make = (initial: Piece[], solution: MoveRecord[]): BigPuzzle | null => {
      if (!meetsLevel(initial, goal, solution, level)) return null;
      const puzzle: BigPuzzle = { id: o.id, mode: o.mode, difficulty: o.difficulty, size: o.size, variant: classic ? undefined : variant, number: o.number, goal, initial, solution, generatorVersion: BIG_GENERATOR_VERSION };
      return validateBigPuzzle(puzzle) ? puzzle : null;
    };
    if (!level.exact) {
      // hard: too deep to search exactly; scramble that forces big-block moves, shortened to a near-optimal reference
      for (let t = 0; t < 3; t++) {
        const states = bigChain(rng, goal, o.size, (classic ? 5 : 6 + (o.size - 4) * 2) + randInt(rng, 3), classic ? 7 : 5).reverse();
        const raw: MoveRecord[] = [];
        for (let i = 0; i < states.length - 1; i++) raw.push(moveBetween(states[i], states[i + 1], o.size));
        const { states: st, moves } = shortenPath(states, raw, o.size);
        const p = make(st[0], moves);
        if (p) return p;
      }
    } else if (o.difficulty === 'easy') {
      // easy: take a start straight from the goal ball, where distances are exact by construction
      const keys = ball.layers.slice(level.minLen, Math.min(level.maxLen, ball.radius) + 1).flat().filter((k) => countBig(pathOut(ball, k), bigIds) >= level.minBigMoves);
      for (let t = 0; t < 30 && keys.length; t++) {
        const k = keys[randInt(rng, keys.length)];
        const p = make(ball.nodes.get(k)!.state, reverseMoves(pathOut(ball, k)));
        if (p) return p;
      }
    } else {
      // normal: start from a far state that already needs the big blocks, drift a few small-tile
      // steps further away, and measure the exact optimal length by meeting in the middle
      let deepest = ball.radius;
      while (deepest > 0 && ball.layers[deepest].length === 0) deepest--;
      const far = ball.layers[deepest].filter((k) => countBig(pathOut(ball, k), bigIds) >= level.minBigMoves);
      const top = Math.min(level.maxLen, 2 * ball.radius); // lengths up to 2 * radius are certified
      if (top < level.minLen) continue;
      for (let t = 0; t < 8 && far.length; t++) {
        let cur = ball.nodes.get(far[randInt(rng, far.length)])!.state;
        let last: MoveRecord | null = null;
        const base = level.minLen - deepest;
        const extra = base + randInt(rng, Math.max(1, top - level.minLen - base + 2));
        for (let i = 0; i < extra; i++) {
          const opts = legalMoves(cur, o.size).filter((m) => !bigIds.has(m.id) && !(last && m.id === last.id && m.dir === OPPOSITE[last.dir]));
          if (!opts.length) break;
          const m = opts[randInt(rng, opts.length)];
          cur = movePiece(cur, o.size, m.id, m.dir)!;
          last = m;
        }
        const sol = optimalSolution(cur, o.size, ball, ball.radius);
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
  const classic = (o.variant ?? 'classic') === 'classic';
  for (const difficulty of order) {
    // non-classic boards are searched under a time budget so the page never freezes; Easy is always cheap
    const deadline = classic || difficulty === 'easy' ? Infinity : Date.now() + (difficulty === 'hard' ? 700 : 500);
    const p = tryGenerate({ ...o, difficulty }, deadline);
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

export function generateBigEndless(size: BoardSize, difficulty: Difficulty, seed = `${Date.now()}-${Math.random()}`, variant: Variant = 'classic'): BigPuzzle {
  return generateBigPuzzle({ seed: `endless|${seed}`, id: `bigendless-${seed}`, mode: 'endless', difficulty, size, variant });
}

// re-exported for tests
export { buildGrid, canMoveOn, DIRS };
