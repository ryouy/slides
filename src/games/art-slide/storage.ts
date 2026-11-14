import { createContext, createElement, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { isValidArtState, type ArtState } from './logic/game';
import { ART_LEVELS, type ArtLevel } from './logic/board';
import { GALLERY_COLUMN_OPTIONS, GROUP_OPTIONS, type GalleryColumns, type GroupBy } from './logic/gallery';
import { updateBest } from '../../storage/stats';
import type { Best } from '../../storage/storage';

/** Separate localStorage key: ART SLIDE data never mixes with the other games. */
export const ART_KEY = 'artslide:save';
export const ART_SAVE_VERSION = 1;

export interface ArtDailyRecord {
  number: number;
  artworkId: string;
  timeMs: number;
  moves: number;
}
export interface ArtPlayRecord {
  date: string;
  mode: 'daily' | 'endless';
  size: ArtLevel;
  artworkId: string;
  timeMs: number;
  moves: number;
}
export interface ArtSave {
  version: number;
  completed: number;
  dailyHistory: Record<string, ArtDailyRecord>;
  /** Best time and fewest moves per board size ('3' | '4' | '5'). */
  bests: Record<string, Best>;
  history: ArtPlayRecord[];
  inProgress: { daily?: ArtState; free?: ArtState };
  lastSize: ArtLevel;
  showNumbers: boolean;
  /** Grouping, grid density, and randomized order (legacy sort preference is discarded). */
  gallery: { groupBy: GroupBy; columns: GalleryColumns; randomSeed: number; randomized: boolean };
}

export const defaultArtSave = (): ArtSave => ({
  version: ART_SAVE_VERSION,
  completed: 0,
  dailyHistory: {},
  bests: {},
  history: [],
  inProgress: {},
  lastSize: 3,
  showNumbers: false,
  gallery: { groupBy: 'theme', columns: 'auto', randomSeed: 0, randomized: false },
});

export function migrateArt(raw: unknown): ArtSave {
  const d = defaultArtSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<ArtSave>;
  if (typeof r.version !== 'number' || r.version > ART_SAVE_VERSION) return d;
  const legacySortBy = (r.gallery as { sortBy?: unknown } | undefined)?.sortBy;
  const out: ArtSave = {
    ...d,
    ...r,
    version: ART_SAVE_VERSION,
    dailyHistory: r.dailyHistory ?? {},
    bests: r.bests ?? {},
    history: Array.isArray(r.history) ? r.history : [],
    lastSize: ART_LEVELS.includes(r.lastSize as ArtLevel) ? (r.lastSize as ArtLevel) : 3,
    gallery: {
      groupBy: GROUP_OPTIONS.some((o) => o.id === r.gallery?.groupBy) ? r.gallery!.groupBy : 'theme',
      columns: GALLERY_COLUMN_OPTIONS.includes(r.gallery?.columns as GalleryColumns)
        ? (r.gallery!.columns as GalleryColumns)
        : 'auto',
      randomSeed: typeof r.gallery?.randomSeed === 'number' && Number.isFinite(r.gallery.randomSeed)
        ? r.gallery.randomSeed
        : 0,
      randomized: typeof r.gallery?.randomized === 'boolean' ? r.gallery.randomized : legacySortBy === 'random',
    },
    inProgress: {},
  };
  if (r.inProgress?.daily && isValidArtState(r.inProgress.daily)) out.inProgress.daily = r.inProgress.daily;
  if (r.inProgress?.free && isValidArtState(r.inProgress.free)) out.inProgress.free = r.inProgress.free;
  return out;
}

export function loadArt(): ArtSave {
  try {
    const t = localStorage.getItem(ART_KEY);
    return t ? migrateArt(JSON.parse(t)) : defaultArtSave();
  } catch {
    return defaultArtSave();
  }
}

function persistArt(d: ArtSave) {
  try {
    localStorage.setItem(ART_KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: the game keeps working in memory */
  }
}

export function recordArtClear(data: ArtSave, r: { state: ArtState; dateKey: string }): ArtSave {
  const p = r.state.puzzle;
  const next: ArtSave = {
    ...data,
    completed: data.completed + 1,
    history: [...data.history, { date: r.dateKey, mode: p.mode, size: p.size, artworkId: p.artworkId, timeMs: r.state.elapsedMs, moves: r.state.moves }].slice(-200),
  };
  if (p.mode === 'daily') {
    if (!data.dailyHistory[r.dateKey]) next.dailyHistory = { ...data.dailyHistory, [r.dateKey]: { number: p.number ?? 0, artworkId: p.artworkId, timeMs: r.state.elapsedMs, moves: r.state.moves } };
  } else {
    next.bests = { ...data.bests, [p.size]: updateBest(data.bests[p.size] ?? {}, r.state.elapsedMs, r.state.moves) };
  }
  return next;
}

interface Ctx {
  data: ArtSave;
  getData: () => ArtSave;
  update: (fn: (d: ArtSave) => ArtSave) => void;
  setProgress: (mode: 'daily' | 'free', s: ArtState | undefined) => void;
}
const ArtCtx = createContext<Ctx | null>(null);

export function ArtSaveProvider({ children }: { children: ReactNode }) {
  const ref = useRef<ArtSave>(null as unknown as ArtSave);
  if (ref.current === null) ref.current = loadArt();
  const [tick, force] = useReducer((x: number) => x + 1, 0);
  const update = useCallback((fn: (d: ArtSave) => ArtSave) => {
    ref.current = fn(ref.current);
    persistArt(ref.current);
    force();
  }, []);
  const setProgress = useCallback((mode: 'daily' | 'free', s: ArtState | undefined) => {
    ref.current = { ...ref.current, inProgress: { ...ref.current.inProgress, [mode]: s } };
    persistArt(ref.current);
  }, []);
  const getData = useCallback(() => ref.current, []);
  const value = useMemo(() => ({ data: ref.current, getData, update, setProgress }), [tick, getData, update, setProgress]); // eslint-disable-line react-hooks/exhaustive-deps
  return createElement(ArtCtx.Provider, { value }, children);
}

export function useArtSave(): Ctx {
  const c = useContext(ArtCtx);
  if (!c) throw new Error('ArtSaveProvider missing');
  return c;
}
