import { describe, expect, it } from 'vitest';
import { getArtwork } from '../data';
import { DAILY_POOL_V2, DAILY_POOL_V3 } from '../data/daily-pools';
import { DAILY_POOL_V2_FROM, DAILY_POOL_V3_FROM, dailyArtworkId } from './generator';

describe('curated artwork of the day', () => {
  it('keeps the 2026-11-14 replacement stable, with a substantial Japanese museum label', () => {
    expect(DAILY_POOL_V2_FROM).toBe('2026-11-14');
    expect(dailyArtworkId('2026-11-14')).toBe('aic-4887');
    const art = getArtwork(dailyArtworkId('2026-11-14'));
    expect(art?.title).toBe('Irises');
    expect(art?.descriptionKind).toBe('museum_text');
    expect(art?.descriptionTranslations?.ja?.length).toBeGreaterThanOrEqual(200);
  });

  it('keeps all original V2 entries untouched while V3 is a curated future pool', () => {
    expect(DAILY_POOL_V3_FROM).toBe('2026-11-15');
    expect(DAILY_POOL_V2).toContain('hokusai-hara');
    expect(DAILY_POOL_V3.length).toBeGreaterThanOrEqual(60);
    expect(new Set(DAILY_POOL_V3).size).toBe(DAILY_POOL_V3.length);
    for (const id of DAILY_POOL_V3) {
      const art = getArtwork(id);
      expect(art).toBeDefined();
      expect(art?.descriptionKind).toBe('museum_text');
      expect(art?.descriptionTranslations?.ja?.length).toBeGreaterThanOrEqual(150);
    }
  });

  it('cycles through every curated artwork once before repeating', () => {
    const day = Date.parse('2026-11-15T00:00:00Z');
    const chosen = Array.from({ length: DAILY_POOL_V3.length }, (_, index) => (
      dailyArtworkId(new Date(day + index * 86400000).toISOString().slice(0, 10))
    ));
    expect(new Set(chosen).size).toBe(DAILY_POOL_V3.length);
    expect(new Set(chosen)).toEqual(new Set(DAILY_POOL_V3));
  });

  it('returns a deterministic artwork for dates prior to the new rotation', () => {
    expect(dailyArtworkId('2026-11-13')).toBe(dailyArtworkId('2026-11-13'));
  });
});
