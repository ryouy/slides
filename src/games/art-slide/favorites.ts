import { useSyncExternalStore } from 'react';

/**
 * The paintings the visitor starred. Kept in this browser only (its own localStorage key, so the records that are synced with
 * Google Drive keep their shape). Custom photos are not starred.
 */
export const FAVORITES_KEY = 'artslide:favorites';

const listeners = new Set<() => void>();
let cache: readonly string[] | null = null;

function load(): readonly string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120) : [];
  } catch {
    return [];
  }
}

function read(): readonly string[] {
  return (cache ??= load());
}

function write(ids: readonly string[]): void {
  cache = ids;
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids)); } catch { /* storage may be blocked: the star still works until the page closes */ }
  listeners.forEach((l) => l());
}

export const isFavorite = (id: string): boolean => read().includes(id);

export function toggleFavorite(id: string): void {
  const ids = read();
  write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === FAVORITES_KEY || e.key === null) { cache = null; cb(); } }; // another tab changed it
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

/** The starred painting ids; the component re-renders when they change. */
export function useFavorites(): readonly string[] {
  return useSyncExternalStore(subscribe, read, () => []);
}
