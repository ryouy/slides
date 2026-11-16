import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { isValidArtState, type ArtState } from './logic/game';
import { ART_LEVELS, type ArtLevel } from './logic/board';
import { GALLERY_COLUMN_OPTIONS, GROUP_OPTIONS, type GalleryColumns, type GroupBy } from './logic/gallery';
import { updateBest } from '../../storage/stats';
import type { Best } from '../../storage/storage';
import type { KeyRecord } from '../../sync/doc';
import { recordKey } from '../../sync/doc';
import type { LocalStore } from '../../sync/engine';

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
  /** Random id of THIS browser: counts are kept per device so syncing never counts a clear twice. */
  deviceId: string;
  /** Total clears per device (this device + the others seen through Google Drive sync). */
  counters: Record<string, number>;
  /** Best time, fewest moves and clears per painting AND board size ("<artworkId>:<size>"). */
  records: Record<string, KeyRecord>;
  /** Best time / fewest moves / clears of the visitor's own photos ("<custom:id>:<size>"). Kept apart from the paintings and never synced. */
  customRecords: Record<string, CustomRecord>;
}

export interface CustomRecord {
  bestTimeMs?: number;
  bestMoves?: number;
  clears: number;
  lastClearedAt?: number;
}

const newDeviceId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

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
  deviceId: newDeviceId(),
  counters: {},
  records: {},
  customRecords: {},
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
  // records for Drive sync: older saves get them from what they already hold (nothing is dropped)
  out.deviceId = typeof r.deviceId === 'string' && r.deviceId ? r.deviceId : d.deviceId;
  const completed = typeof r.completed === 'number' && r.completed >= 0 ? r.completed : 0;
  out.counters = isCounts(r.counters) ? { ...r.counters } : completed > 0 ? { [out.deviceId]: completed } : {};
  out.completed = Math.max(completed, Object.values(out.counters).reduce((a, b) => a + b, 0));
  out.records = isRecords(r.records) ? r.records : recordsFromHistory(out.history, out.deviceId);
  out.customRecords = isObj(r.customRecords) ? (r.customRecords as Record<string, CustomRecord>) : {};
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCounts = (v: unknown): v is Record<string, number> => isObj(v) && Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
const isRecords = (v: unknown): v is Record<string, KeyRecord> => isObj(v) && Object.values(v).every((x) => isObj(x) && isCounts(x.clears));

/** Per painting and size records built from the play history of a save that predates them. */
export function recordsFromHistory(history: ArtPlayRecord[], deviceId: string): Record<string, KeyRecord> {
  const out: Record<string, KeyRecord> = {};
  for (const h of history) {
    const k = recordKey(h.artworkId, h.size);
    const r = (out[k] ??= { clears: {} });
    r.clears[deviceId] = (r.clears[deviceId] ?? 0) + 1;
    r.bestTimeMs = r.bestTimeMs === undefined ? h.timeMs : Math.min(r.bestTimeMs, h.timeMs);
    r.bestMoves = r.bestMoves === undefined ? h.moves : Math.min(r.bestMoves, h.moves);
  }
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

function bumpRecord(data: ArtSave, artworkId: string, size: number, timeMs: number, moves: number): Record<string, KeyRecord> {
  const k = recordKey(artworkId, size);
  const old = data.records[k];
  const rec: KeyRecord = {
    bestTimeMs: old?.bestTimeMs === undefined ? timeMs : Math.min(old.bestTimeMs, timeMs),
    bestMoves: old?.bestMoves === undefined ? moves : Math.min(old.bestMoves, moves),
    lastClearedAt: Date.now(),
    clears: { ...(old?.clears ?? {}), [data.deviceId]: (old?.clears?.[data.deviceId] ?? 0) + 1 },
  };
  return { ...data.records, [k]: rec };
}

export function recordArtClear(data: ArtSave, r: { state: ArtState; dateKey: string }): ArtSave {
  const p = r.state.puzzle;
  if (p.artworkId.startsWith('custom:')) {
    // the visitor's own photo: its own small record, nothing in the painting records, counters, history or Drive sync
    const k = `${p.artworkId}:${p.size}`;
    const old = data.customRecords[k];
    return {
      ...data,
      customRecords: {
        ...data.customRecords,
        [k]: {
          bestTimeMs: old?.bestTimeMs === undefined ? r.state.elapsedMs : Math.min(old.bestTimeMs, r.state.elapsedMs),
          bestMoves: old?.bestMoves === undefined ? r.state.moves : Math.min(old.bestMoves, r.state.moves),
          clears: (old?.clears ?? 0) + 1,
          lastClearedAt: Date.now(),
        },
      },
    };
  }
  const next: ArtSave = {
    ...data,
    completed: data.completed + 1,
    counters: { ...data.counters, [data.deviceId]: (data.counters[data.deviceId] ?? 0) + 1 },
    records: bumpRecord(data, p.artworkId, p.size, r.state.elapsedMs, r.state.moves),
    history: [...data.history, { date: r.dateKey, mode: p.mode, size: p.size, artworkId: p.artworkId, timeMs: r.state.elapsedMs, moves: r.state.moves }].slice(-200),
  };
  if (p.mode === 'daily') {
    if (!data.dailyHistory[r.dateKey] || data.dailyHistory[r.dateKey].artworkId !== p.artworkId) {
      next.dailyHistory = { ...data.dailyHistory, [r.dateKey]: { number: p.number ?? 0, artworkId: p.artworkId, timeMs: r.state.elapsedMs, moves: r.state.moves } };
    }
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
  useEffect(() => {
    bridge = { getData, update };
    return () => { if (bridge?.getData === getData) bridge = null; };
  }, [getData, update]);
  return createElement(ArtCtx.Provider, { value }, children);
}

/** What the Drive sync works on: the mounted game store when there is one, else the stored save itself. */
let bridge: Pick<Ctx, 'getData' | 'update'> | null = null;
export const artLocalStore: LocalStore = {
  get: () => bridge?.getData() ?? loadArt(),
  update: (fn) => (bridge ? bridge.update(fn) : persistArt(fn(loadArt()))),
};

export function useArtSave(): Ctx {
  const c = useContext(ArtCtx);
  if (!c) throw new Error('ArtSaveProvider missing');
  return c;
}
