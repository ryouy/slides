import { describe, expect, it } from 'vitest';
import type { Artwork } from '../types';
import { GROUP_OPTIONS, groupArtworks, sortArtworks } from './gallery';
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

  it('discards obsolete sort menus while migrating existing grouping preferences', () => {
    const old = defaultArtSave();
    const migrated = migrateArt({ ...old, gallery: { groupBy: 'artist', sortBy: 'year-desc' } });
    expect(migrated.gallery).toEqual({
      groupBy: 'theme', columns: 'auto', randomSeed: 0, randomized: false, // grouping by artist no longer exists: the default is used
    });
    expect('sortBy' in migrated.gallery).toBe(false);
  });

  it('migrates a previously randomized gallery without losing its shuffled order', () => {
    const old = defaultArtSave();
    const migrated = migrateArt({ ...old, gallery: { groupBy: 'theme', sortBy: 'random', columns: 4, randomSeed: 712 } });
    expect(migrated.gallery).toEqual({
      groupBy: 'theme', columns: 4, randomSeed: 712, randomized: true,
    });
  });

  it('remembers the new column, grouping and random settings', () => {
    const stored = defaultArtSave();
    stored.gallery = { groupBy: 'none', columns: 5, randomSeed: 712, randomized: true };
    expect(migrateArt(stored).gallery).toEqual(stored.gallery);
  });
});

describe('Premium-locked paintings go last in every group', () => {
  const locked = (a: Artwork) => Number(a.id.split('-')[1]) % 3 === 0; // every third painting is locked
  const sorts = ['artist', 'title', 'year-asc', 'year-desc', 'random'] as const;

  it('whatever the grouping or sort: inside each group the open ones come first, the locked ones after', () => {
    for (const by of ['none', 'theme', 'era'] as const) {
      for (const sort of sorts) {
        for (const g of groupArtworks(paintings, by, sort, 7, locked)) {
          const flags = g.items.map(locked);
          const firstLocked = flags.indexOf(true);
          expect(firstLocked === -1 || flags.slice(firstLocked).every(Boolean), `${by}/${sort}/${g.key}`).toBe(true); // no open painting after a locked one
        }
      }
    }
  });

  it('each part keeps the chosen order, nothing is lost or repeated, and the groups themselves do not move', () => {
    const plain = groupArtworks(paintings, 'theme', 'year-asc', 0);
    const ordered = groupArtworks(paintings, 'theme', 'year-asc', 0, locked);
    expect(ordered.map((g) => g.key)).toEqual(plain.map((g) => g.key));
    for (const g of ordered) {
      const same = plain.find((p) => p.key === g.key)!;
      expect([...g.items].map((a) => a.id).sort()).toEqual([...same.items].map((a) => a.id).sort());
      expect(g.items.filter((a) => !locked(a)).map((a) => a.id)).toEqual(same.items.filter((a) => !locked(a)).map((a) => a.id));
      expect(g.items.filter(locked).map((a) => a.id)).toEqual(same.items.filter(locked).map((a) => a.id));
    }
  });

  it('with nothing locked (a Premium visitor, or the paid plan off) the order is exactly as before', () => {
    for (const by of ['none', 'theme', 'era'] as const) {
      expect(groupArtworks(paintings, by, 'title', 3, () => false)).toEqual(groupArtworks(paintings, by, 'title', 3));
    }
  });

  it('there is no grouping by artist any more', () => {
    expect(GROUP_OPTIONS.map((o) => o.id)).toEqual(['none', 'theme', 'era']);
  });
});
