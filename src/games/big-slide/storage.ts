import { createContext, createElement, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { isValidBigState, type BigState } from './logic/game';
import type { BigPuzzle, BoardSize, Difficulty } from './logic/types';
import { updateBest } from '../../storage/stats';
import type { Best } from '../../storage/storage';

/** Separate localStorage key: BIG SLIDE data never mixes with WORD SLIDE data. */
export const BIG_KEY = 'bigslide:save';
export const BIG_SAVE_VERSION = 1;

export interface BigDailyRecord {
  number: number;
  timeMs: number;
  moves: number;
  bigMoves: number;
}
export interface BigPlayRecord {
  date: string;
  mode: 'daily' | 'endless';
  size: BoardSize;
  difficulty: Difficulty;
  timeMs: number;
  moves: number;
  bigMoves: number;
}
export interface BigSave {
  version: number;
  completed: number;
  dailyHistory: Record<string, BigDailyRecord>;
  endlessStreak: number;
  maxEndlessStreak: number;
  /** Keyed by `${size}-${difficulty}`. */
  bests: Record<string, Best>;
  history: BigPlayRecord[];
  inProgress: { daily?: BigState; endless?: BigState };
  lastSize: BoardSize;
  lastDifficulty: Difficulty;
}

export const bestKey = (size: BoardSize, d: Difficulty) => `${size}-${d}`;

export const defaultBigSave = (): BigSave => ({
  version: BIG_SAVE_VERSION,
  completed: 0,
  dailyHistory: {},
  endlessStreak: 0,
  maxEndlessStreak: 0,
  bests: {},
  history: [],
  inProgress: {},
  lastSize: 4,
  lastDifficulty: 'normal',
});

export function migrateBig(raw: unknown): BigSave {
  const d = defaultBigSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<BigSave>;
  if (typeof r.version !== 'number' || r.version > BIG_SAVE_VERSION) return d;
  const out: BigSave = {
    ...d,
    ...r,
    version: BIG_SAVE_VERSION,
    dailyHistory: r.dailyHistory ?? {},
    bests: r.bests ?? {},
    history: Array.isArray(r.history) ? r.history : [],
    inProgress: {},
  };
  if (r.inProgress?.daily && isValidBigState(r.inProgress.daily)) out.inProgress.daily = r.inProgress.daily;
  if (r.inProgress?.endless && isValidBigState(r.inProgress.endless)) out.inProgress.endless = r.inProgress.endless;
  return out;
}

export function loadBig(): BigSave {
  try {
    const t = localStorage.getItem(BIG_KEY);
    return t ? migrateBig(JSON.parse(t)) : defaultBigSave();
  } catch {
    return defaultBigSave();
  }
}

function persistBig(d: BigSave) {
  try {
    localStorage.setItem(BIG_KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: the game keeps working in memory */
  }
}

export function recordBigClear(
  data: BigSave,
  r: { puzzle: BigPuzzle; dateKey: string; timeMs: number; moves: number; bigMoves: number },
): BigSave {
  const { puzzle: p } = r;
  const next: BigSave = {
    ...data,
    completed: data.completed + 1,
    history: [...data.history, { date: r.dateKey, mode: p.mode, size: p.size, difficulty: p.difficulty, timeMs: r.timeMs, moves: r.moves, bigMoves: r.bigMoves }].slice(-200),
  };
  if (p.mode === 'daily') {
    if (!data.dailyHistory[r.dateKey]) next.dailyHistory = { ...data.dailyHistory, [r.dateKey]: { number: p.number ?? 0, timeMs: r.timeMs, moves: r.moves, bigMoves: r.bigMoves } };
  } else {
    next.endlessStreak = data.endlessStreak + 1;
    next.maxEndlessStreak = Math.max(data.maxEndlessStreak, next.endlessStreak);
    const k = bestKey(p.size, p.difficulty);
    next.bests = { ...data.bests, [k]: updateBest(data.bests[k] ?? {}, r.timeMs, r.moves) };
  }
  return next;
}

interface Ctx {
  data: BigSave;
  getData: () => BigSave;
  update: (fn: (d: BigSave) => BigSave) => void;
  setProgress: (mode: 'daily' | 'endless', s: BigState | undefined) => void;
}
const BigCtx = createContext<Ctx | null>(null);

export function BigSaveProvider({ children }: { children: ReactNode }) {
  const ref = useRef<BigSave>(null as unknown as BigSave);
  if (ref.current === null) ref.current = loadBig();
  const [tick, force] = useReducer((x: number) => x + 1, 0);
  const update = useCallback((fn: (d: BigSave) => BigSave) => {
    ref.current = fn(ref.current);
    persistBig(ref.current);
    force();
  }, []);
  const setProgress = useCallback((mode: 'daily' | 'endless', s: BigState | undefined) => {
    ref.current = { ...ref.current, inProgress: { ...ref.current.inProgress, [mode]: s } };
    persistBig(ref.current);
  }, []);
  const getData = useCallback(() => ref.current, []);
  const value = useMemo(() => ({ data: ref.current, getData, update, setProgress }), [tick, getData, update, setProgress]); // eslint-disable-line react-hooks/exhaustive-deps
  return createElement(BigCtx.Provider, { value }, children);
}

export function useBigSave(): Ctx {
  const c = useContext(BigCtx);
  if (!c) throw new Error('BigSaveProvider missing');
  return c;
}
