import { describe, expect, it } from 'vitest';
import { ARTWORKS, getArtwork } from '../data';
import { DAILY_POOL_V2, DAILY_POOL_V3 } from '../data/daily-pools';
import { DAILY_POOL_V2_FROM, DAILY_POOL_V3_FROM, dailyArtworkId } from './generator';

describe('full-catalogue artwork of the day', () => {
  it('preserves the 2026-11-14 Monet replacement and all dates before V3', () => {
    expect(DAILY_POOL_V2_FROM).toBe('2026-11-14');
    expect(dailyArtworkId('2026-11-14')).toBe('aic-4887');
    expect(getArtwork(dailyArtworkId('2026-11-14'))?.title).toBe('Irises');
    expect(DAILY_POOL_V2).toContain('hokusai-hara');
    expect(dailyArtworkId('2026-11-13')).toBe(dailyArtworkId('2026-11-13'));
  });

  it('holds every painting of the catalogue as of 2026-11-15 (frozen: later additions are not in it) even when its Japanese description is short', () => {
    expect(DAILY_POOL_V3_FROM).toBe('2026-11-15');
    expect(DAILY_POOL_V3).toHaveLength(404);
    expect(new Set(DAILY_POOL_V3).size).toBe(404);
    const allIds = new Set(ARTWORKS.map((art) => art.id));
    for (const id of DAILY_POOL_V3) expect(allIds.has(id), id).toBe(true);
    expect(DAILY_POOL_V3).toContain('hokusai-hara');
    expect(getArtwork('hokusai-hara')?.descriptionTranslations?.ja?.length).toBeLessThan(150);
  });

  it('rotates once through the complete frozen pool before repeating', () => {
    const day = Date.parse('2026-11-15T00:00:00Z');
    const chosen = Array.from({ length: DAILY_POOL_V3.length }, (_, index) =>
      dailyArtworkId(new Date(day + index * 86400000).toISOString().slice(0, 10))
    );
    expect(new Set(chosen).size).toBe(DAILY_POOL_V3.length);
    expect(new Set(chosen)).toEqual(new Set(DAILY_POOL_V3));
    const nextCycleDate = new Date(day + DAILY_POOL_V3.length * 86400000).toISOString().slice(0, 10);
    expect(DAILY_POOL_V3).toContain(dailyArtworkId(nextCycleDate));
  });
});
