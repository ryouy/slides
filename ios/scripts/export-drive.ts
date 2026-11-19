/**
 * Golden vectors for the Swift port of the Google Drive sync document (run: `npx vite-node ios/scripts/export-drive.ts`).
 * Writes ios/SlideKit/Tests/SlideCoreTests/Golden/drive.json, produced by the WEB code (src/sync/doc.ts, src/sync/local.ts):
 *   merges:     pairs of documents -> mergeDocs result
 *   normalize:  raw JSON (some damaged / from a newer app) -> normalizeDoc result (null = unreadable)
 *   toDoc:      web saves -> toDoc
 *   fromMerged: web save + document -> the records fromMerged writes back
 * DriveTests.swift must reproduce every one exactly.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { emptyDoc, mergeDocs, normalizeDoc, type HistoryEntry, type SyncDoc } from '../../src/sync/doc';
import { applyDoc, toDoc } from '../../src/sync/local';
import { defaultArtSave, type ArtSave } from '../../src/games/art-slide/storage';

let seed = 20261119;
const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = <T>(a: T[]): T => a[rnd(a.length)];
const devs = ['devA', 'devB', 'devC'];
const arts = ['aic-81539', 'monet-water-lilies', 'van-gogh-bedroom', 'a_b-2', 'z9'];
const day = (i: number) => `2026-11-${String(1 + i).padStart(2, '0')}`;

function randDoc(): SyncDoc {
  const d = emptyDoc();
  for (const v of devs) if (rnd(2)) d.counters[v] = 1 + rnd(9);
  for (const k of ['3', '4', '5', '6', '7']) if (rnd(2)) d.bests[k] = { ...(rnd(3) ? { timeMs: 1000 * (1 + rnd(9)) } : {}), ...(rnd(3) ? { moves: 10 + rnd(90) } : {}) };
  for (let i = 0; i < rnd(5); i++) {
    const key = `${pick(arts)}:${3 + rnd(5)}`;
    const clears: Record<string, number> = {};
    for (const v of devs) if (rnd(2)) clears[v] = 1 + rnd(5);
    d.records[key] = { ...(rnd(4) ? { bestTimeMs: 1000 * (1 + rnd(9)) } : {}), ...(rnd(4) ? { bestMoves: 10 + rnd(90) } : {}), ...(rnd(3) ? { lastClearedAt: 1_700_000_000_000 + rnd(1000) * 1000 } : {}), clears };
  }
  for (let i = 0; i < rnd(6); i++) d.dailyHistory[day(rnd(8))] = { number: 1 + rnd(30), artworkId: rnd(5) ? 'aic-81539' : pick(arts), timeMs: 1000 * (1 + rnd(5)), moves: 10 + rnd(5) };
  for (let i = 0; i < rnd(8); i++) {
    const h: HistoryEntry = { date: day(rnd(8)), mode: rnd(2) ? 'daily' : 'endless', size: 3 + rnd(5), artworkId: pick(arts), timeMs: [7, 70, 700, 7000, 70000][rnd(5)], moves: [9, 90, 900][rnd(3)] };
    d.history.push(h);
  }
  return d;
}

const merges: { a: SyncDoc; b: SyncDoc; merged: SyncDoc }[] = [];
for (let i = 0; i < 60; i++) { const a = randDoc(), b = randDoc(); merges.push({ a, b, merged: mergeDocs(a, b) }); }
// history beyond the 200 limit, with ids that sort differently by bytes and by locale
const big = (from: number, n: number): SyncDoc => ({ ...emptyDoc(), history: Array.from({ length: n }, (_, i) => ({ date: day((from + i) % 9), mode: 'endless' as const, size: 3 + ((from + i) % 5), artworkId: pick(arts), timeMs: (from + i) * 37 + 5, moves: (from + i) % 97 + 1 })) });
{ const a = big(0, 150), b = big(120, 160); merges.push({ a, b, merged: mergeDocs(a, b) }); }

const raws: unknown[] = [
  emptyDoc(), randDoc(), randDoc(),
  { schema: 99, counters: { x: 1 } }, { schema: 0 }, { schema: 'x' }, [], null, 'str',
  { schema: 1 },
  { schema: 1, counters: { 'ok-id': 3, 'bad id!': 4, neg: -1, big: 1e9, frac: 2.6 }, bests: { '3': { timeMs: 5.4, moves: -1 }, 'x': { timeMs: 1 }, '12': {} } },
  { schema: 1, records: { 'monet:3': { clears: { a: 1 }, bestTimeMs: 'x', lastClearedAt: 1.7e12 }, 'bad key': { clears: {} }, 'm:123': {clears: {}} } },
  { schema: 1, dailyHistory: { '2026-11-01': { artworkId: 'a', timeMs: 1, moves: 2 }, '2026-1-1': { artworkId: 'a', timeMs: 1, moves: 2 }, '2026-11-02': { artworkId: '', timeMs: 1, moves: 2 } } },
  { schema: 1, history: [{ date: '2026-11-01', mode: 'daily', size: 4, artworkId: 'a', timeMs: 1, moves: 1 }, { date: '2026-11-01', mode: 'weird', size: 4, artworkId: 'a', timeMs: 1, moves: 1 }, 5] },
];
const normalize = raws.map((raw) => ({ raw, normalized: normalizeDoc(raw) }));

const saveWith = (over: Partial<ArtSave>): ArtSave => ({ ...defaultArtSave(), deviceId: 'devA', ...over });
const saves: ArtSave[] = [
  saveWith({}),
  saveWith({ counters: { devA: 3, devB: 2 }, completed: 5, bests: { '3': { timeMs: 50000, moves: 80 }, '4': { timeMs: 9 } }, records: { 'monet-water-lilies:3': { bestTimeMs: 50000, bestMoves: 80, lastClearedAt: 1000, clears: { devA: 3, devB: 2 } } },
    dailyHistory: { '2026-11-15': { number: 15, artworkId: 'aic-81539', timeMs: 70000, moves: 90 } }, history: [{ date: '2026-11-15', mode: 'daily', size: 4, artworkId: 'aic-81539', timeMs: 70000, moves: 90 }] }),
  saveWith({ counters: { devA: 4 }, completed: 6, records: { 'a:5': { clears: { devA: 4 } } } }), // completed above the counters (an older total)
];
const toDocs = saves.map((save) => ({ save, doc: toDoc(save) }));

const fromMerged = saves.flatMap((save) => [randDoc(), randDoc(), toDoc(save)].map((doc) => {
  const r = applyDoc(save, doc);
  return { save, doc, result: { counters: r.counters, completed: r.completed, bests: r.bests, records: r.records, dailyHistory: r.dailyHistory, history: r.history } };
}));

const dir = new URL('../SlideKit/Tests/SlideCoreTests/Golden/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
writeFileSync(dir + 'drive.json', JSON.stringify({ merges, normalize, toDoc: toDocs.map((t) => ({ save: pickSave(t.save), doc: t.doc })), fromMerged: fromMerged.map((f) => ({ save: pickSave(f.save), doc: f.doc, result: f.result })) }));
function pickSave(s: ArtSave) { return { deviceId: s.deviceId, completed: s.completed, counters: s.counters, bests: s.bests, records: s.records, dailyHistory: s.dailyHistory, history: s.history }; }
console.log(`export-drive: ${merges.length} merges, ${normalize.length} normalize, ${toDocs.length} toDoc, ${fromMerged.length} fromMerged`);
