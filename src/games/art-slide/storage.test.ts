import { describe, expect, it } from 'vitest';
import { defaultArtSave, migrateArt, recordArtClear, recordsFromHistory, type ArtSave } from './storage';
import { newArtGame } from './logic/game';
import { generateArtFree } from './logic/generator';

const legacy = {
  version: 1,
  completed: 7,
  dailyHistory: { '2026-11-15': { number: 15, artworkId: 'aic-81539', timeMs: 70_000, moves: 90 } },
  bests: { '3': { timeMs: 50_000, moves: 80 } },
  history: [
    { date: '2026-11-14', mode: 'endless', size: 3, artworkId: 'monet-water-lilies', timeMs: 60_000, moves: 85 },
    { date: '2026-11-15', mode: 'endless', size: 3, artworkId: 'monet-water-lilies', timeMs: 50_000, moves: 90 },
    { date: '2026-11-15', mode: 'endless', size: 6, artworkId: 'monet-water-lilies', timeMs: 400_000, moves: 500 },
  ],
  lastSize: 4,
  showNumbers: true,
};

describe('existing saves gain sync records without losing anything', () => {
  it('keeps every old field and derives counters and per painting/size records', () => {
    const s = migrateArt(legacy);
    expect(s.completed).toBe(7);
    expect(s.bests).toEqual(legacy.bests);
    expect(s.dailyHistory).toEqual(legacy.dailyHistory);
    expect(s.history).toEqual(legacy.history);
    expect(s.lastSize).toBe(4);
    expect(s.showNumbers).toBe(true);
    expect(s.deviceId).toBeTruthy();
    expect(s.counters).toEqual({ [s.deviceId]: 7 });
    expect(s.records['monet-water-lilies:3']).toMatchObject({ bestTimeMs: 50_000, bestMoves: 85, clears: { [s.deviceId]: 2 } });
    expect(s.records['monet-water-lilies:6'].clears[s.deviceId]).toBe(1); // another size is another record
  });
  it('is stable: migrating again changes nothing, and the device id never changes', () => {
    const once = migrateArt(legacy);
    expect(migrateArt(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
  it('a new device gets an id and empty records', () => {
    const d = defaultArtSave();
    expect(d.deviceId).toBeTruthy();
    expect(d.counters).toEqual({});
    expect(d.records).toEqual({});
    expect(defaultArtSave().deviceId).not.toBe(d.deviceId);
  });
  it('rebuilding records from history is per painting and size', () => {
    expect(Object.keys(recordsFromHistory(legacy.history as never, 'dev'))).toEqual(['monet-water-lilies:3', 'monet-water-lilies:6']);
  });
});

describe('a clear updates the synced records', () => {
  const clear = (s: ArtSave, art: string, size: 3 | 6, elapsedMs: number, moves: number) => {
    const state = newArtGame(generateArtFree(art, size, 'x'));
    return recordArtClear(s, { state: { ...state, elapsedMs, moves, status: 'cleared' }, dateKey: '2026-11-16' });
  };
  it('counts this device once, keeps the better time and fewest moves', () => {
    let s = migrateArt(legacy);
    s = clear(s, 'monet-water-lilies', 3, 45_000, 100);
    s = clear(s, 'monet-water-lilies', 3, 55_000, 70);
    expect(s.completed).toBe(9);
    expect(s.counters[s.deviceId]).toBe(9);
    expect(s.records['monet-water-lilies:3']).toMatchObject({ bestTimeMs: 45_000, bestMoves: 70 });
    expect(s.records['monet-water-lilies:3'].clears[s.deviceId]).toBe(4);
    expect(s.records['monet-water-lilies:3'].lastClearedAt).toBeGreaterThan(0);
    expect(s.records['monet-water-lilies:6'].clears[s.deviceId]).toBe(1); // untouched
  });
});
