import type { Difficulty } from '../core/types';
import type { Best, SaveData } from './storage';

const prevDay = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** Consecutive cleared daily puzzles ending today (or yesterday, if today is not cleared yet). */
export function currentDailyStreak(history: SaveData['dailyHistory'], today: string): number {
  let day = history[today] ? today : prevDay(today);
  let n = 0;
  while (history[day]) {
    n++;
    day = prevDay(day);
  }
  return n;
}

export function maxDailyStreak(history: SaveData['dailyHistory']): number {
  const days = Object.keys(history).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    run = prev && prevDay(d) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function updateBest(b: Best, timeMs: number, moves: number): Best {
  return {
    timeMs: b.timeMs === undefined ? timeMs : Math.min(b.timeMs, timeMs),
    moves: b.moves === undefined ? moves : Math.min(b.moves, moves),
  };
}

export function recordClear(
  data: SaveData,
  r: { mode: 'daily' | 'endless'; difficulty: Difficulty; dateKey: string; number?: number; timeMs: number; moves: number; checks: number; hints?: number; noHint?: boolean },
): SaveData {
  const next: SaveData = {
    ...data,
    completed: data.completed + 1,
    noHintClears: data.noHintClears + (r.noHint ? 1 : 0),
    history: [...data.history, { date: r.dateKey, mode: r.mode, difficulty: r.difficulty, timeMs: r.timeMs, moves: r.moves, checks: r.checks, hints: r.hints ?? 0, noHint: !!r.noHint }].slice(-200),
  };
  if (r.mode === 'daily') {
    if (!data.dailyHistory[r.dateKey]) {
      next.dailyHistory = { ...data.dailyHistory, [r.dateKey]: { number: r.number ?? 0, timeMs: r.timeMs, moves: r.moves, checks: r.checks, hints: r.hints ?? 0 } };
    }
  } else {
    next.endlessStreak = data.endlessStreak + 1;
    next.maxEndlessStreak = Math.max(data.maxEndlessStreak, next.endlessStreak);
    next.bests = { ...data.bests, [r.difficulty]: updateBest(data.bests[r.difficulty], r.timeMs, r.moves) };
  }
  return next;
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
