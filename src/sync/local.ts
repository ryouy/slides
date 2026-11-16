import { ART_LEVELS, type ArtLevel } from '../games/art-slide/logic/board';
import type { ArtSave } from '../games/art-slide/storage';
import { emptyDoc, mergeDocs, totalClears, type SyncDoc } from './doc';

/** The device's play records as a sync document. Settings and puzzles in progress are not synced. */
export function toDoc(save: ArtSave): SyncDoc {
  const d = emptyDoc();
  d.counters = { ...save.counters };
  for (const [k, b] of Object.entries(save.bests)) {
    if (b && (b.timeMs !== undefined || b.moves !== undefined)) d.bests[k] = { ...(b.timeMs !== undefined ? { timeMs: b.timeMs } : {}), ...(b.moves !== undefined ? { moves: b.moves } : {}) };
  }
  for (const [k, r] of Object.entries(save.records)) d.records[k] = { ...r, clears: { ...r.clears } };
  d.dailyHistory = { ...save.dailyHistory };
  d.history = save.history.map((h) => ({ ...h }));
  return d;
}

/** Folds a document into the device's records. Only ever adds or improves: nothing the device has is removed. */
export function applyDoc(save: ArtSave, remote: SyncDoc): ArtSave {
  const merged = mergeDocs(toDoc(save), remote);
  return fromMerged(save, merged);
}

export function fromMerged(save: ArtSave, merged: SyncDoc): ArtSave {
  return {
    ...save,
    counters: merged.counters,
    completed: Math.max(save.completed, totalClears(merged)),
    bests: { ...save.bests, ...merged.bests },
    records: merged.records,
    dailyHistory: merged.dailyHistory,
    history: merged.history.filter((h): h is typeof h & { size: ArtLevel } => (ART_LEVELS as readonly number[]).includes(h.size)),
  };
}
