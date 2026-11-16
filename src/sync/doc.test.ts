import { describe, expect, it } from 'vitest';
import { emptyDoc, HISTORY_LIMIT, mergeDocs, normalizeDoc, recordKey, SYNC_SCHEMA, totalClears, type SyncDoc } from './doc';

const docA = (): SyncDoc => ({
  schema: 1,
  counters: { devA: 5 },
  bests: { '3': { timeMs: 50_000, moves: 80 }, '4': { timeMs: 120_000 } },
  records: { 'monet-water-lilies:3': { bestTimeMs: 50_000, bestMoves: 80, lastClearedAt: 1000, clears: { devA: 3 } } },
  dailyHistory: { '2026-11-15': { number: 15, artworkId: 'aic-81539', timeMs: 70_000, moves: 90 } },
  history: [{ date: '2026-11-15', mode: 'daily', size: 4, artworkId: 'aic-81539', timeMs: 70_000, moves: 90 }],
});
const docB = (): SyncDoc => ({
  schema: 1,
  counters: { devA: 4, devB: 2 },
  bests: { '3': { timeMs: 40_000, moves: 95 }, '5': { timeMs: 300_000, moves: 400 } },
  records: {
    'monet-water-lilies:3': { bestTimeMs: 40_000, bestMoves: 95, lastClearedAt: 2000, clears: { devA: 2, devB: 2 } },
    'van-gogh-bedroom:6': { bestTimeMs: 900_000, clears: { devB: 1 } },
  },
  dailyHistory: { '2026-11-15': { number: 15, artworkId: 'aic-81539', timeMs: 60_000, moves: 100 }, '2026-11-16': { number: 16, artworkId: 'x', timeMs: 1, moves: 1 } },
  history: [{ date: '2026-11-16', mode: 'endless', size: 3, artworkId: 'van-gogh-bedroom', timeMs: 5, moves: 6 }],
});

describe('merging records from two devices', () => {
  it('keeps the best of both, counts each device once, and unions the rest', () => {
    const m = mergeDocs(docA(), docB());
    expect(m.counters).toEqual({ devA: 5, devB: 2 }); // devA's own larger count, not 5 + 4
    expect(totalClears(m)).toBe(7);
    expect(m.bests['3']).toEqual({ timeMs: 40_000, moves: 80 }); // best time from B, fewest moves from A
    expect(m.bests['4']).toEqual({ timeMs: 120_000 });
    expect(m.bests['5']).toEqual({ timeMs: 300_000, moves: 400 });
    expect(m.records['monet-water-lilies:3']).toEqual({ bestTimeMs: 40_000, bestMoves: 80, lastClearedAt: 2000, clears: { devA: 3, devB: 2 } });
    expect(m.records['van-gogh-bedroom:6']).toBeDefined(); // another size of another painting is its own record
    expect(m.dailyHistory['2026-11-15'].timeMs).toBe(60_000); // same day on two devices: the faster clear
    expect(Object.keys(m.dailyHistory)).toHaveLength(2);
    expect(m.history).toHaveLength(2);
  });

  it('is idempotent, commutative and associative, so repeated or concurrent syncs converge', () => {
    const a = docA();
    const b = docB();
    const c: SyncDoc = { ...emptyDoc(), counters: { devC: 9 }, bests: { '3': { timeMs: 1 } } };
    expect(mergeDocs(a, a)).toEqual(a);
    expect(mergeDocs(a, b)).toEqual(mergeDocs(b, a));
    expect(mergeDocs(mergeDocs(a, b), c)).toEqual(mergeDocs(a, mergeDocs(b, c)));
    const once = mergeDocs(a, b);
    expect(mergeDocs(once, b)).toEqual(once); // syncing the same data again changes nothing (no double counting)
  });

  it('never makes any record worse', () => {
    const a = docA();
    const m = mergeDocs(a, docB());
    for (const [k, v] of Object.entries(a.bests)) {
      if (v.timeMs !== undefined) expect(m.bests[k].timeMs!).toBeLessThanOrEqual(v.timeMs);
      if (v.moves !== undefined) expect(m.bests[k].moves!).toBeLessThanOrEqual(v.moves);
    }
    for (const [d, n] of Object.entries(a.counters)) expect(m.counters[d]).toBeGreaterThanOrEqual(n);
  });

  it('keeps only the most recent history entries', () => {
    const many = (n: number): SyncDoc => ({ ...emptyDoc(), history: Array.from({ length: n }, (_, i) => ({ date: '2026-11-01', mode: 'endless' as const, size: 3, artworkId: 'a', timeMs: i, moves: i })) });
    expect(mergeDocs(many(150), many(300)).history.length).toBe(HISTORY_LIMIT);
  });

  it('record keys separate board sizes of the same painting', () => {
    expect(recordKey('monet-water-lilies', 3)).not.toBe(recordKey('monet-water-lilies', 6));
  });
});

describe('reading a document from Drive', () => {
  it('accepts what we wrote and ignores junk values', () => {
    expect(normalizeDoc(JSON.parse(JSON.stringify(docA())))).toEqual(mergeDocs(docA(), emptyDoc()));
    const dirty = normalizeDoc({ schema: 1, counters: { good: 3, bad: -1, worse: 'x', 'bad id!': 4 }, bests: { '3': { timeMs: -5, moves: 'a' }, 'abc': {} }, records: { 'no-size': { clears: {} } }, history: [{ junk: true }, null, 5] });
    expect(dirty).toEqual({ ...emptyDoc(), counters: { good: 3 }, bests: { '3': {} } });
  });
  it('refuses unknown, older-than-1 and NEWER schema versions (never overwrite what a newer app wrote)', () => {
    expect(normalizeDoc(null)).toBeNull();
    expect(normalizeDoc([])).toBeNull();
    expect(normalizeDoc({ counters: {} })).toBeNull();
    expect(normalizeDoc({ schema: 0 })).toBeNull();
    expect(normalizeDoc({ schema: SYNC_SCHEMA + 1, counters: {} })).toBeNull();
  });
});
