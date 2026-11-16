/**
 * The play-record document kept in the user's own Google Drive (appDataFolder) and merged with the device's records.
 *
 * Merging is built so that nothing can be lost or counted twice, whatever order devices sync in:
 *  - counts are kept PER DEVICE (merge = the larger count of each device), then summed
 *  - best times / fewest moves only ever get better (merge = minimum)
 *  - history entries are a set (merge = union)
 * mergeDocs is commutative, associative and idempotent, so syncing twice or from two devices at once converges.
 *
 * Only play records live here: never the subscription or Premium status (those stay in Cloudflare D1).
 */
export const SYNC_SCHEMA = 1;
export const HISTORY_LIMIT = 200;
const MAX_RECORDS = 6000;

export interface BestRec { timeMs?: number; moves?: number }
export interface KeyRecord {
  bestTimeMs?: number;
  bestMoves?: number;
  /** unix ms of the latest clear */
  lastClearedAt?: number;
  /** clears of this painting at this size, per device */
  clears: Record<string, number>;
}
export interface HistoryEntry { date: string; mode: 'daily' | 'endless'; size: number; artworkId: string; timeMs: number; moves: number }
export interface DailyEntry { number: number; artworkId: string; timeMs: number; moves: number }

export interface SyncDoc {
  schema: number;
  /** total clears, per device */
  counters: Record<string, number>;
  /** best per board size ('3'..'7') */
  bests: Record<string, BestRec>;
  /** per painting AND board size: "<artworkId>:<size>" */
  records: Record<string, KeyRecord>;
  dailyHistory: Record<string, DailyEntry>;
  history: HistoryEntry[];
}

export const recordKey = (artworkId: string, size: number): string => `${artworkId}:${size}`;

export const emptyDoc = (): SyncDoc => ({ schema: SYNC_SCHEMA, counters: {}, bests: {}, records: {}, dailyHistory: {}, history: [] });

const minDef = (a?: number, b?: number): number | undefined => (a === undefined ? b : b === undefined ? a : Math.min(a, b));
const maxDef = (a?: number, b?: number): number | undefined => (a === undefined ? b : b === undefined ? a : Math.max(a, b));
const maxMap = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};
const sortedObject = <T>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const histKey = (h: HistoryEntry) => `${h.date}|${h.mode}|${h.size}|${h.artworkId}|${h.timeMs}|${h.moves}`;

function mergeKeyRecord(a: KeyRecord | undefined, b: KeyRecord | undefined): KeyRecord {
  const out: KeyRecord = { clears: maxMap(a?.clears ?? {}, b?.clears ?? {}) };
  const t = minDef(a?.bestTimeMs, b?.bestTimeMs);
  const m = minDef(a?.bestMoves, b?.bestMoves);
  const l = maxDef(a?.lastClearedAt, b?.lastClearedAt);
  if (t !== undefined) out.bestTimeMs = t;
  if (m !== undefined) out.bestMoves = m;
  if (l !== undefined) out.lastClearedAt = l;
  return out;
}

export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  const bests: Record<string, BestRec> = {};
  for (const k of new Set([...Object.keys(a.bests), ...Object.keys(b.bests)])) {
    const t = minDef(a.bests[k]?.timeMs, b.bests[k]?.timeMs);
    const m = minDef(a.bests[k]?.moves, b.bests[k]?.moves);
    bests[k] = { ...(t !== undefined ? { timeMs: t } : {}), ...(m !== undefined ? { moves: m } : {}) };
  }
  const records: Record<string, KeyRecord> = {};
  for (const k of new Set([...Object.keys(a.records), ...Object.keys(b.records)])) records[k] = mergeKeyRecord(a.records[k], b.records[k]);

  // a day's first clear stands; if two devices cleared the same day's painting, the faster one is kept
  const dailyHistory: Record<string, DailyEntry> = {};
  for (const k of new Set([...Object.keys(a.dailyHistory), ...Object.keys(b.dailyHistory)])) {
    const x = a.dailyHistory[k];
    const y = b.dailyHistory[k];
    if (!x || !y) dailyHistory[k] = (x ?? y)!;
    else if (x.artworkId !== y.artworkId) dailyHistory[k] = [x, y].sort((p, q) => p.artworkId.localeCompare(q.artworkId))[0];
    else dailyHistory[k] = x.timeMs !== y.timeMs ? (x.timeMs < y.timeMs ? x : y) : x.moves <= y.moves ? x : y;
  }

  const seen = new Map<string, HistoryEntry>();
  for (const h of [...a.history, ...b.history]) seen.set(histKey(h), h);
  const history = [...seen.values()].sort((p, q) => histKey(p).localeCompare(histKey(q))).slice(-HISTORY_LIMIT);

  return {
    schema: Math.max(a.schema, b.schema),
    counters: sortedObject(maxMap(a.counters, b.counters)),
    bests: sortedObject(bests),
    records: sortedObject(records),
    dailyHistory: sortedObject(dailyHistory),
    history,
  };
}

export const totalClears = (d: SyncDoc): number => Object.values(d.counters).reduce((s, n) => s + n, 0);

// ---- reading what came from Drive: never trust it blindly ----
const num = (v: unknown, max = 1e9): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : undefined);
const idStr = (v: unknown, max = 80): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= max && /^[\w.:|-]+$/.test(v) ? v : undefined);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function cleanCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v)) {
    const id = idStr(k);
    const c = num(n, 1e7);
    if (id && c !== undefined) out[id] = c;
  }
  return out;
}

/**
 * Validates a document read from Drive. Returns null when it is not a records document or was written by a
 * NEWER version of the app (schema higher than ours): in that case nothing may be overwritten.
 */
export function normalizeDoc(raw: unknown): SyncDoc | null {
  if (!isObj(raw)) return null;
  if (typeof raw.schema !== 'number' || raw.schema > SYNC_SCHEMA || raw.schema < 1) return null;
  const doc = emptyDoc();
  doc.counters = cleanCounts(raw.counters);
  if (isObj(raw.bests)) {
    for (const [k, b] of Object.entries(raw.bests)) {
      if (!/^\d{1,2}$/.test(k) || !isObj(b)) continue;
      const t = num(b.timeMs);
      const m = num(b.moves);
      doc.bests[k] = { ...(t !== undefined ? { timeMs: t } : {}), ...(m !== undefined ? { moves: m } : {}) };
    }
  }
  if (isObj(raw.records)) {
    for (const [k, r] of Object.entries(raw.records).slice(0, MAX_RECORDS)) {
      if (!/^[\w-]{1,80}:\d{1,2}$/.test(k) || !isObj(r)) continue;
      const rec: KeyRecord = { clears: cleanCounts(r.clears) };
      const t = num(r.bestTimeMs);
      const m = num(r.bestMoves);
      const l = num(r.lastClearedAt, 1e14);
      if (t !== undefined) rec.bestTimeMs = t;
      if (m !== undefined) rec.bestMoves = m;
      if (l !== undefined) rec.lastClearedAt = l;
      doc.records[k] = rec;
    }
  }
  if (isObj(raw.dailyHistory)) {
    for (const [k, d] of Object.entries(raw.dailyHistory)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isObj(d)) continue;
      const art = idStr(d.artworkId);
      const t = num(d.timeMs);
      const m = num(d.moves);
      const n = num(d.number) ?? 0;
      if (art && t !== undefined && m !== undefined) doc.dailyHistory[k] = { number: n, artworkId: art, timeMs: t, moves: m };
    }
  }
  if (Array.isArray(raw.history)) {
    for (const h of raw.history.slice(-HISTORY_LIMIT * 2)) {
      if (!isObj(h)) continue;
      const art = idStr(h.artworkId);
      const t = num(h.timeMs);
      const m = num(h.moves);
      const s = num(h.size, 20);
      if (art && t !== undefined && m !== undefined && s !== undefined && typeof h.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && (h.mode === 'daily' || h.mode === 'endless')) {
        doc.history.push({ date: h.date, mode: h.mode, size: s, artworkId: art, timeMs: t, moves: m });
      }
    }
    doc.history = doc.history.slice(-HISTORY_LIMIT);
  }
  return doc;
}
