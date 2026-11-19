import Foundation

/// Port of the web's `src/sync/local.ts`: ART records <-> the Drive document.
/// The iOS save keeps the UI's totals (`records[k].clears`, `completed`) and, next to them, the split per device (`counters`, `keyClears`).
public enum DriveRecords {
    /// The device's play records as a document. Own photos, settings and puzzles in progress are not part of it.
    /// A total that is larger than its per-device split (older saves, or counts merged in by the other sync feature) is attributed to this device.
    public static func toDoc(_ save: ArtSave) -> DriveDoc {
        var d = DriveDoc()
        let own = save.deviceId
        d.counters = save.counters
        let excess = save.completed - save.counters.values.reduce(0, +)
        if excess > 0 && !own.isEmpty { d.counters[own, default: 0] += excess }
        for (k, b) in save.bests where b.timeMs != nil || b.moves != nil { d.bests[k] = .init(timeMs: b.timeMs, moves: b.moves) }
        for (k, r) in save.records {
            var clears = save.keyClears[k] ?? [:]
            let ex = r.clears - clears.values.reduce(0, +)
            if ex > 0 && !own.isEmpty { clears[own, default: 0] += ex }
            d.records[k] = .init(bestTimeMs: r.bestTimeMs, bestMoves: r.bestMoves, lastClearedAt: r.lastClearedAt.map { Int($0.rounded()) }, clears: clears)
        }
        for (k, r) in save.dailyHistory { d.dailyHistory[k] = .init(number: r.number, artworkId: r.artworkId, timeMs: r.timeMs, moves: r.moves) }
        d.history = save.history.map { .init(date: $0.date, mode: $0.mode, size: $0.size, artworkId: $0.artworkId, timeMs: $0.timeMs, moves: $0.moves) }
        return d
    }

    /// Folds a merged document into the save. Only ever adds or improves (the document already contains everything the device had).
    public static func fromMerged(_ save: ArtSave, _ merged: DriveDoc) -> ArtSave {
        var s = save
        s.counters = merged.counters
        s.completed = max(save.completed, merged.totalClears)
        for (k, b) in merged.bests { s.bests[k] = ArtBest(timeMs: b.timeMs, moves: b.moves) }
        s.records = [:]; s.keyClears = [:]
        for (k, r) in merged.records {
            s.records[k] = ArtKeyRecord(bestTimeMs: r.bestTimeMs, bestMoves: r.bestMoves, clears: r.clears.values.reduce(0, +), lastClearedAt: r.lastClearedAt.map(Double.init))
            s.keyClears[k] = r.clears
        }
        s.dailyHistory = merged.dailyHistory.mapValues { ArtDailyRecord(number: $0.number, artworkId: $0.artworkId, timeMs: $0.timeMs, moves: $0.moves) }
        s.history = merged.history.filter { artLevels.contains($0.size) }.map { ArtPlayRecord(date: $0.date, mode: $0.mode, size: $0.size, artworkId: $0.artworkId, timeMs: $0.timeMs, moves: $0.moves) }
        return s
    }

    /// Replaces the play records (never puzzles in progress, preferences, own photos or this install's id) with empty ones.
    public static func cleared(_ save: ArtSave) -> ArtSave {
        var s = save
        s.completed = 0; s.dailyHistory = [:]; s.bests = [:]; s.history = []; s.records = [:]; s.counters = [:]; s.keyClears = [:]
        return s
    }
}
