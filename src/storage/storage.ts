import { isValidGameState, type GameState } from '../core/game';
import type { Difficulty } from '../core/types';

export const SAVE_VERSION = 1;
const KEY = 'wordslide:save';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  /** Chosen language; null = follow the browser. */
  lang: string | null;
  theme: ThemePref;
  colorblind: boolean;
  /** Ad personalisation / cookie consent: null = not asked yet. */
  adConsent: boolean | null;
}

export interface DailyRecord {
  number: number;
  timeMs: number;
  moves: number;
  checks: number;
  hints?: number;
}

export interface PlayRecord {
  date: string;
  noHint?: boolean;
  hints?: number;
  mode: 'daily' | 'endless';
  difficulty: Difficulty;
  timeMs: number;
  moves: number;
  checks: number;
}

export interface Best {
  timeMs?: number;
  moves?: number;
}

export interface SaveData {
  version: number;
  settings: Settings;
  completed: number;
  noHintClears: number;
  dailyHistory: Record<string, DailyRecord>;
  endlessStreak: number;
  maxEndlessStreak: number;
  bests: Record<Difficulty, Best>;
  history: PlayRecord[];
  inProgress: { daily?: GameState; endless?: GameState };
  lastDifficulty: Difficulty;
}

export const defaultSave = (): SaveData => ({
  version: SAVE_VERSION,
  settings: { lang: null, theme: 'system', colorblind: false, adConsent: null },
  completed: 0,
  noHintClears: 0,
  dailyHistory: {},
  endlessStreak: 0,
  maxEndlessStreak: 0,
  bests: { easy: {}, normal: {}, hard: {} },
  history: [],
  inProgress: {},
  lastDifficulty: 'normal',
});

/** Migrate / sanitise whatever is in storage into the current shape. */
export function migrate(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  if (typeof r.version !== 'number' || r.version > SAVE_VERSION) return d;
  // future versions: add `if (r.version < 2) {...}` steps here
  const out: SaveData = {
    ...d,
    ...r,
    version: SAVE_VERSION,
    settings: { ...d.settings, ...(r.settings ?? {}) },
    bests: { ...d.bests, ...(r.bests ?? {}) },
    dailyHistory: r.dailyHistory ?? {},
    history: Array.isArray(r.history) ? r.history : [],
    inProgress: {},
  };
  if (r.inProgress?.daily && isValidGameState(r.inProgress.daily)) out.inProgress.daily = r.inProgress.daily;
  if (r.inProgress?.endless && isValidGameState(r.inProgress.endless)) out.inProgress.endless = r.inProgress.endless;
  return out;
}

export function loadSave(): SaveData {
  try {
    const txt = localStorage.getItem(KEY);
    return txt ? migrate(JSON.parse(txt)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function persist(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode / quota): the game keeps working in memory */
  }
}
