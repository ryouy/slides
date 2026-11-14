import { describe, expect, it } from 'vitest';
import type { Artwork } from '../types';
import { groupArtworks, sortArtworks } from './gallery';
import { defaultArtSave, migrateArt } from '../storage';

const paintings = Array.from({ length: 30 }, (_, i) => ({
  id: `painting-${i}`,
  title: `Painting ${i}`,
  artist: i % 2 === 0 ? 'Artist A' : 'Artist B',
  artistSort: i % 2 === 0 ? 'a' : 'b',
  theme: i % 2 === 0 ? 'Landscape' : 'Portrait',
  era: '1880–1899',
  yearStart: 1880 + i,
} as Artwork));

describe('gallery preferences', () => {
  it('returns a reproducible random order without changing its input', () => {
    const initialOrder = paintings.map((a) => a.id);
    const once = sortArtworks(paintings, 'random', 123).map((a) => a.id);
    expect(sortArtworks(paintings, 'random', 123).map((a) => a.id)).toEqual(once);
    expect(once).not.toEqual(initialOrder);
    expect(paintings.map((a) => a.id)).toEqual(initialOrder);
  });

  it('reshuffles when the seed changes, while preserving the same artworks', () => {
    const first = sortArtworks(paintings, 'random', 123).map((a) => a.id);
    const second = sortArtworks(paintings, 'random', 456).map((a) => a.id);
    expect(second).not.toEqual(first);
    expect(new Set(second)).toEqual(new Set(first));
  });

  it('can randomize across all artworks or within selected groups', () => {
    const all = groupArtworks(paintings, 'none', 'random', 123);
    const grouped = groupArtworks(paintings, 'theme', 'random', 123);
    expect(all).toHaveLength(1);
    expect(all[0].items).toHaveLength(paintings.length);
    expect(grouped).toHaveLength(2);
    expect(grouped.reduce((n, g) => n + g.items.length, 0)).toBe(paintings.length);
  });

  it('migrates old gallery preferences without losing the stored sort', () => {
    const old = defaultArtSave();
    const migrated = migrateArt({ ...old, gallery: { groupBy: 'artist', sortBy: 'year-desc' } });
    expect(migrated.gallery).toEqual({ groupBy: 'artist', sortBy: 'year-desc', columns: 'auto', randomSeed: 0 });
  });

  it('remembers valid column and random settings', () => {
    const stored = defaultArtSave();
    stored.gallery = { groupBy: 'none', sortBy: 'random', columns: 5, randomSeed: 712 };
    expect(migrateArt(stored).gallery).toEqual(stored.gallery);
  });
});
