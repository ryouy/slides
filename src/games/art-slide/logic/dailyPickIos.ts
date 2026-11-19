import { rngFromString, shuffled } from '../../../utils/rng';
import { dailyNumber } from '../../../utils/date';
import { FREE_ARTWORK_IDS } from '../../../premium/freeList';

/**
 * Daily painting for the iOS app. Every painting here is bundled in the app, so the daily puzzle always works offline.
 * Independent of the web rotation (dailyPick.ts), which is never touched.
 *
 * Pools are FROZEN COPIES: a pool never changes once released, so already-played dates keep their painting. When free paintings
 * are added later, append a new entry (with a future `from` date) to IOS_DAILY_POOLS; earlier dates keep using the older pool.
 * Inside one pool a painting repeats only after the whole pool has been shown once (each cycle is shuffled differently).
 */
export const IOS_DAILY_ALGO = 'ios1';
export interface IosPool { from: string; ids: readonly string[] }

export const IOS_DAILY_POOLS: readonly IosPool[] = [
  { from: '2026-11-01', ids: [...FREE_ARTWORK_IDS] },
];

export function iosPoolFor(dateKey: string): IosPool {
  let pool = IOS_DAILY_POOLS[0];
  for (const p of IOS_DAILY_POOLS) if (dateKey >= p.from) pool = p;
  return pool;
}

export function dailyArtworkIdIos(dateKey: string): string {
  const pool = iosPoolFor(dateKey);
  const n = pool.ids.length;
  const idx = dailyNumber(dateKey) - dailyNumber(pool.from);
  const cycle = Math.floor(idx / n);
  const order = shuffled(rngFromString(`art-daily|${IOS_DAILY_ALGO}|${pool.from}|cycle${cycle}`), pool.ids);
  return order[((idx % n) + n) % n];
}
