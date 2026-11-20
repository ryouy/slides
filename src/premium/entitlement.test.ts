import { describe, expect, it } from 'vitest';
import { ARTWORKS } from '../games/art-slide/data';
import { ART_LEVELS } from '../games/art-slide/logic/board';
import { nextArtwork, pickRandomArtwork, playableArtworks } from '../games/art-slide/data';
import { FREE_ARTWORK_IDS, FREE_MAX_LEVEL, isArtworkLocked, isCustomArtwork, isLevelLocked } from './entitlement';

describe('free artwork list', () => {
  it('is 75 distinct, existing, fixed paintings (the first 40 are the original list)', () => {
    expect(FREE_ARTWORK_IDS).toHaveLength(75);
    expect(new Set(FREE_ARTWORK_IDS).size).toBe(75);
    const ids = new Set(ARTWORKS.map((a) => a.id));
    for (const id of FREE_ARTWORK_IDS) expect(ids.has(id), id).toBe(true);
  });
  it('covers every theme and era (not lopsided)', () => {
    const free = ARTWORKS.filter((a) => FREE_ARTWORK_IDS.includes(a.id));
    expect(new Set(free.map((a) => a.theme)).size).toBe(new Set(ARTWORKS.map((a) => a.theme)).size);
    expect(new Set(free.map((a) => a.era)).size).toBe(new Set(ARTWORKS.map((a) => a.era)).size);
    expect(new Set(free.map((a) => a.artist)).size).toBeGreaterThanOrEqual(60);
  });
});

describe('locks', () => {
  const locked = ARTWORKS.find((a) => !FREE_ARTWORK_IDS.includes(a.id))!;
  it('Free cannot open Premium paintings; Premium can; nothing is locked while gating is off', () => {
    expect(isArtworkLocked(locked.id, false, true)).toBe(true);
    expect(isArtworkLocked(locked.id, true, true)).toBe(false);
    expect(isArtworkLocked(FREE_ARTWORK_IDS[0], false, true)).toBe(false);
    expect(isArtworkLocked(locked.id, false, false)).toBe(false);
  });
  it('boards above level 5 are Premium; Premium has up to level 7', () => {
    expect(FREE_MAX_LEVEL).toBe(5);
    expect(Math.max(...ART_LEVELS)).toBe(7); // Premium's top level
    for (const l of ART_LEVELS) expect(isLevelLocked(l, false, true)).toBe(l > 5);
    for (const l of ART_LEVELS) expect(isLevelLocked(l, true, true)).toBe(false);
  });
  it('paintings added in the future are Premium-only for Free, and open for Premium', () => {
    expect(isArtworkLocked('a-painting-added-next-year', false, true)).toBe(true);
    expect(isArtworkLocked('a-painting-added-next-year', true, true)).toBe(false);
  });
  it('custom photos are recognised', () => {
    expect(isCustomArtwork('custom:abc')).toBe(true);
    expect(isCustomArtwork('van-gogh-bedroom')).toBe(false);
  });
  it('random and "next" never hand a Free visitor a locked painting', () => {
    expect(playableArtworks(false, true)).toHaveLength(75);
    expect(playableArtworks(true, true)).toHaveLength(ARTWORKS.length);
    for (let i = 0; i < 200; i++) expect(isArtworkLocked(pickRandomArtwork(undefined, Math.random, false, true).id, false, true)).toBe(false);
    let id = FREE_ARTWORK_IDS[0];
    for (let i = 0; i < 75; i++) {
      id = nextArtwork(id, false, true).id;
      expect(FREE_ARTWORK_IDS).toContain(id);
    }
  });
});
