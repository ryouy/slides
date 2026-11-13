import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { GameState } from '../core/game';
import { loadSave, persist, type SaveData } from './storage';

interface Ctx {
  data: SaveData;
  /** Always-fresh data (use for reading in-progress games at mount time). */
  getData: () => SaveData;
  /** Update save data and re-render. */
  update: (fn: (d: SaveData) => SaveData) => void;
  /** Store (or clear) an in-progress game without re-rendering the app. */
  setProgress: (mode: 'daily' | 'endless', s: GameState | undefined) => void;
}

const SaveCtx = createContext<Ctx | null>(null);

export function SaveProvider({ children }: { children: ReactNode }) {
  const ref = useRef<SaveData>(null as unknown as SaveData);
  if (ref.current === null) ref.current = loadSave();
  const [tick, force] = useReducer((x: number) => x + 1, 0);

  const update = useCallback((fn: (d: SaveData) => SaveData) => {
    ref.current = fn(ref.current);
    persist(ref.current);
    force();
  }, []);

  const setProgress = useCallback((mode: 'daily' | 'endless', s: GameState | undefined) => {
    ref.current = { ...ref.current, inProgress: { ...ref.current.inProgress, [mode]: s } };
    persist(ref.current);
  }, []);

  // `tick` makes the memo refresh whenever update() ran
  const getData = useCallback(() => ref.current, []);
  const value = useMemo(() => ({ data: ref.current, getData, update, setProgress }), [tick, getData, update, setProgress]); // eslint-disable-line react-hooks/exhaustive-deps
  return <SaveCtx.Provider value={value}>{children}</SaveCtx.Provider>;
}

export function useSave(): Ctx {
  const c = useContext(SaveCtx);
  if (!c) throw new Error('SaveProvider missing');
  return c;
}
