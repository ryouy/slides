const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** Daily #1 is this date (shared by all games). */
export const DAILY_EPOCH = '2026-11-01';

/** Date key (YYYY-MM-DD) in Japan Standard Time; daily puzzles roll over at 0:00 JST. */
export function jstDateKey(now: number = Date.now()): string {
  return new Date(now + JST_OFFSET_MS).toISOString().slice(0, 10);
}

const dayNumber = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86400000);

export function dailyNumber(key: string): number {
  return dayNumber(key) - dayNumber(DAILY_EPOCH) + 1;
}
