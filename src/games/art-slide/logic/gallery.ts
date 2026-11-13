import type { Artwork } from '../types';

export type GroupBy = 'none' | 'artist' | 'era' | 'theme';
export type SortBy = 'artist' | 'title' | 'year-asc' | 'year-desc';

export const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'none', label: 'No grouping' },
  { id: 'theme', label: 'Theme' },
  { id: 'artist', label: 'Artist' },
  { id: 'era', label: 'Era' },
];
export const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: 'artist', label: 'Artist A–Z' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'year-asc', label: 'Year: oldest first' },
  { id: 'year-desc', label: 'Year: newest first' },
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

export function sortArtworks(list: readonly Artwork[], sortBy: SortBy): Artwork[] {
  const arr = [...list];
  const cmp: Record<SortBy, (a: Artwork, b: Artwork) => number> = {
    artist: (a, b) => byText(a.artistSort, b.artistSort) || a.yearStart - b.yearStart || byText(a.title, b.title),
    title: (a, b) => byText(a.title, b.title) || byText(a.artistSort, b.artistSort),
    'year-asc': (a, b) => a.yearStart - b.yearStart || byText(a.artistSort, b.artistSort) || byText(a.title, b.title),
    'year-desc': (a, b) => b.yearStart - a.yearStart || byText(a.artistSort, b.artistSort) || byText(a.title, b.title),
  };
  return arr.sort(cmp[sortBy]);
}

export interface ArtGroup {
  key: string;
  label: string;
  items: Artwork[];
}

/** Groups (already filtered) artworks; items inside each group follow `sortBy`. Empty groups are omitted. */
export function groupArtworks(list: readonly Artwork[], groupBy: GroupBy, sortBy: SortBy): ArtGroup[] {
  const sorted = sortArtworks(list, sortBy);
  if (groupBy === 'none') return sorted.length ? [{ key: 'all', label: '', items: sorted }] : [];
  const keyOf = (a: Artwork) => (groupBy === 'artist' ? a.artist : groupBy === 'era' ? a.era : a.theme);
  const map = new Map<string, Artwork[]>();
  for (const a of sorted) {
    const k = keyOf(a);
    (map.get(k) ?? map.set(k, []).get(k)!).push(a);
  }
  let keys = [...map.keys()];
  if (groupBy === 'artist') keys.sort((x, y) => byText(map.get(x)![0].artistSort, map.get(y)![0].artistSort));
  else {
    const order = groupBy === 'era' ? ERA_ORDER : THEME_ORDER;
    keys = keys.sort((x, y) => (order.indexOf(x) + 1 || 99) - (order.indexOf(y) + 1 || 99) || byText(x, y));
  }
  return keys.map((k) => ({ key: k, label: k, items: map.get(k)! }));
}
