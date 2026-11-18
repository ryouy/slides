import type { Artwork } from '../types';
import { rngFromString } from '../../../utils/rng';

export type GroupBy = 'none' | 'era' | 'theme';
export type SortBy = 'artist' | 'title' | 'year-asc' | 'year-desc' | 'random';
export type GalleryColumns = 'auto' | 1 | 2 | 3 | 4 | 5 | 6;
export const GALLERY_COLUMN_OPTIONS: readonly GalleryColumns[] = ['auto', 1, 2, 3, 4, 5, 6];

export const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'none', label: 'No grouping' },
  { id: 'theme', label: 'Theme' },
  { id: 'era', label: 'Era' },
];
export const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: 'artist', label: 'Artist A–Z' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'year-asc', label: 'Year: oldest first' },
  { id: 'year-desc', label: 'Year: newest first' },
  { id: 'random', label: 'Random' },
];

/** Fixed display order of the groups that have a natural order. */
export const ERA_ORDER = ['Before 1700', '1700s', '1800–1849', '1850–1879', '1880–1899', '1900s'];
export const THEME_ORDER = ['Landscape', 'Sea & Water', 'City & Street', 'People & Daily Life', 'Portrait', 'Still Life & Flowers', 'Myth & Religion', 'Japanese Prints'];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Case- and accent-insensitive match on title, artist, theme, era and year; every word must match. */
export function filterArtworks(list: readonly Artwork[], query: string): Artwork[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter((a) => {
    const hay = fold(`${a.title} ${a.artist} ${a.theme} ${a.era} ${a.year} ${a.medium}`);
    return words.every((w) => hay.includes(w));
  });
}

const byText = (x: string, y: string) => x.localeCompare(y, 'en', { sensitivity: 'base' });

/** Stable per-seed pseudo-random order, so changing filters never unexpectedly reshuffles. */
function randomRank(id: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function sortArtworks(list: readonly Artwork[], sortBy: SortBy, randomSeed = 0): Artwork[] {
  const arr = [...list];
  const cmp: Record<SortBy, (a: Artwork, b: Artwork) => number> = {
    artist: (a, b) => byText(a.artistSort, b.artistSort) || a.yearStart - b.yearStart || byText(a.title, b.title),
    title: (a, b) => byText(a.title, b.title) || byText(a.artistSort, b.artistSort),
    'year-asc': (a, b) => a.yearStart - b.yearStart || byText(a.artistSort, b.artistSort) || byText(a.title, b.title),
    'year-desc': (a, b) => b.yearStart - a.yearStart || byText(a.artistSort, b.artistSort) || byText(a.title, b.title),
    random: (a, b) => randomRank(a.id, randomSeed) - randomRank(b.id, randomSeed) || byText(a.id, b.id),
  };
  return arr.sort(cmp[sortBy]);
}

export interface ArtGroup {
  key: string;
  label: string;
  items: Artwork[];
}

/** Groups (already filtered) artworks; items inside each group follow `sortBy`. Empty groups are omitted. */
export function groupArtworks(list: readonly Artwork[], groupBy: GroupBy, sortBy: SortBy, randomSeed = 0, isLocked: (a: Artwork) => boolean = () => false): ArtGroup[] {
  // within every group the paintings the visitor can play come first, the Premium-locked ones last (each part keeps the chosen order)
  const freeFirst = (items: Artwork[]) => [...items.filter((a) => !isLocked(a)), ...items.filter(isLocked)];
  const sorted = freeFirst(sortArtworks(list, sortBy, randomSeed));
  if (groupBy === 'none') return sorted.length ? [{ key: 'all', label: '', items: sorted }] : [];
  const keyOf = (a: Artwork) => (groupBy === 'era' ? a.era : a.theme);
  const map = new Map<string, Artwork[]>();
  for (const a of sorted) {
    const k = keyOf(a);
    (map.get(k) ?? map.set(k, []).get(k)!).push(a);
  }
  const order = groupBy === 'era' ? ERA_ORDER : THEME_ORDER;
  const keys = [...map.keys()].sort((x, y) => (order.indexOf(x) + 1 || 99) - (order.indexOf(y) + 1 || 99) || byText(x, y));
  return keys.map((k) => ({ key: k, label: k, items: map.get(k)! }));
}

/**
 * A few paintings for the home page of wide screens: the same for everyone on a given day, a different set the next day,
 * each by a different artist. `pool` is what the visitor may play (so a locked painting is never offered).
 */
export function homePicks(pool: readonly Artwork[], dateKey: string, count = 6): Artwork[] {
  const rng = rngFromString(`home-picks|${dateKey}`);
  const order = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1)); // stable start, whatever order the pool came in
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const seen = new Set<string>();
  const out: Artwork[] = [];
  for (const a of order) {
    if (seen.has(a.artist)) continue;
    seen.add(a.artist);
    out.push(a);
    if (out.length === count) break;
  }
  return out;
}
