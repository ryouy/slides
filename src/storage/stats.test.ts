import { describe, expect, it } from 'vitest';
import { currentDailyStreak, formatTime, maxDailyStreak, recordClear, updateBest } from './stats';
import { defaultSave, migrate } from './storage';

const rec = { number: 1, timeMs: 1, moves: 1, checks: 0 };

describe('stats', () => {
  it('computes daily streaks', () => {
    const h = { '2026-11-11': rec, '2026-11-12': rec, '2026-11-13': rec, '2026-11-01': rec };
    expect(currentDailyStreak(h, '2026-11-13')).toBe(3);
    expect(currentDailyStreak(h, '2026-11-14')).toBe(3); // today not played yet
    expect(currentDailyStreak(h, '2026-11-15')).toBe(0);
    expect(maxDailyStreak(h)).toBe(3);
  });
  it('records endless clears with bests and streak, daily clears once', () => {
    let d = recordClear(defaultSave(), { mode: 'endless', difficulty: 'easy', dateKey: '2026-11-13', timeMs: 5000, moves: 40, checks: 1 });
    d = recordClear(d, { mode: 'endless', difficulty: 'easy', dateKey: '2026-11-13', timeMs: 9000, moves: 30, checks: 1 });
    expect(d.completed).toBe(2);
    expect(d.endlessStreak).toBe(2);
    expect(d.bests.easy).toEqual({ timeMs: 5000, moves: 30 });
    d = recordClear(d, { mode: 'daily', difficulty: 'normal', dateKey: '2026-11-13', number: 13, timeMs: 1, moves: 2, checks: 3 });
    d = recordClear(d, { mode: 'daily', difficulty: 'normal', dateKey: '2026-11-13', number: 13, timeMs: 99, moves: 99, checks: 9 });
    expect(d.dailyHistory['2026-11-13'].moves).toBe(2);
    expect(updateBest({}, 5, 6)).toEqual({ timeMs: 5, moves: 6 });
  });
  it('formats time', () => expect(formatTime(75_400)).toBe('1:15'));
  it('migrates garbage safely', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate({ version: 99 })).toEqual(defaultSave());
    expect(migrate({ version: 1, completed: 4, inProgress: { daily: { nope: 1 } } }).inProgress).toEqual({});
    expect(migrate({ version: 1, completed: 4 }).completed).toBe(4);
  });
});
