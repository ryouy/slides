import { describe, expect, it } from 'vitest';
import { FREE_ARTWORK_IDS } from '../../../premium/freeList';
import { dailyArtworkIdIos, IOS_DAILY_POOLS } from './dailyPickIos';
import { dailyArtworkId } from './dailyPick';

const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

describe('iOS daily painting', () => {
  const start = '2026-11-01';
  it('only ever picks a free (bundled) painting', () => {
    for (let i = 0; i < 400; i++) expect(FREE_ARTWORK_IDS).toContain(dailyArtworkIdIos(addDays(start, i)));
  });
  it('shows the whole pool once before any repeats, then reshuffles (second pool, from 2026-12-01)', () => {
    const from = IOS_DAILY_POOLS[1].from;
    const n = IOS_DAILY_POOLS[1].ids.length;
    const c0 = Array.from({ length: n }, (_, i) => dailyArtworkIdIos(addDays(from, i)));
    const c1 = Array.from({ length: n }, (_, i) => dailyArtworkIdIos(addDays(from, n + i)));
    expect(new Set(c0).size).toBe(n);
    expect(new Set(c1).size).toBe(n);
    expect(c1).not.toEqual(c0);
  });
  it('the first pool shows 30 different paintings in November (no repeat before the switch)', () => {
    expect(new Set(Array.from({ length: 30 }, (_, i) => dailyArtworkIdIos(addDays(start, i)))).size).toBe(30);
  });
  it('keeps the first pool frozen (40) and switches to all 75 free paintings from 2026-12-01', () => {
    expect(IOS_DAILY_POOLS[0].ids).toHaveLength(40);
    expect(IOS_DAILY_POOLS[1].from).toBe('2026-12-01');
    expect(IOS_DAILY_POOLS[1].ids).toHaveLength(75);
    for (let i = 0; i < 400; i++) expect(FREE_ARTWORK_IDS).toContain(dailyArtworkIdIos(addDays('2026-12-01', i)));
    for (let i = 0; i < 30; i++) expect(IOS_DAILY_POOLS[0].ids).toContain(dailyArtworkIdIos(addDays('2026-11-01', i)));
  });
  it('is deterministic', () => {
    expect(dailyArtworkIdIos('2027-03-05')).toBe(dailyArtworkIdIos('2027-03-05'));
  });
  it('pins published dates (algorithm must never change silently)', () => {
    expect(['2026-11-18', '2026-11-19', '2027-01-01'].map(dailyArtworkIdIos)).toMatchSnapshot();
  });
  it('leaves the web rotation untouched', () => {
    expect(dailyArtworkId('2026-11-18')).toBeTruthy();
  });
});
