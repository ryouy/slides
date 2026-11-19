import Foundation

/// Port of storage.ts (ART SLIDE save data) + the statistics helpers of storage/stats.ts.
public struct ArtBest: Codable, Hashable, Sendable { public var timeMs: Int?; public var moves: Int?
    public init(timeMs: Int? = nil, moves: Int? = nil) { self.timeMs = timeMs; self.moves = moves }
    public func updated(timeMs t: Int, moves m: Int) -> ArtBest { ArtBest(timeMs: min(timeMs ?? t, t), moves: min(moves ?? m, m)) }
}
public struct ArtDailyRecord: Codable, Hashable, Sendable { public var number: Int; public var artworkId: String; public var timeMs: Int; public var moves: Int }
public struct ArtPlayRecord: Codable, Hashable, Sendable { public var date: String; public var mode: ArtPuzzle.Mode; public var size: Int; public var artworkId: String; public var timeMs: Int; public var moves: Int }
/// Best time / fewest moves / clears per painting AND board size ("<artworkId>:<size>"); the same record is used for the visitor's own photos.
public struct ArtKeyRecord: Codable, Hashable, Sendable {
    public var bestTimeMs: Int?; public var bestMoves: Int?; public var clears: Int; public var lastClearedAt: Double?
    public init(bestTimeMs: Int? = nil, bestMoves: Int? = nil, clears: Int = 0, lastClearedAt: Double? = nil) { self.bestTimeMs = bestTimeMs; self.bestMoves = bestMoves; self.clears = clears; self.lastClearedAt = lastClearedAt }
    public func cleared(timeMs: Int, moves: Int, at now: Double) -> ArtKeyRecord {
        ArtKeyRecord(bestTimeMs: min(bestTimeMs ?? timeMs, timeMs), bestMoves: min(bestMoves ?? moves, moves), clears: clears + 1, lastClearedAt: now)
    }
}
public struct ArtGalleryPrefs: Codable, Hashable, Sendable {
    public var groupBy: GroupBy = .theme
    /// 0 = automatic
    public var columns: Int = 0
    public var randomSeed: UInt32 = 0
    public var randomized = false
    public init() {}
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        groupBy = (try? c.decode(GroupBy.self, forKey: .groupBy)) ?? .theme
        let col = (try? c.decode(Int.self, forKey: .columns)) ?? 0
        columns = ArtGallery.columnOptions.contains(col) ? col : 0
        randomSeed = (try? c.decode(UInt32.self, forKey: .randomSeed)) ?? 0
        randomized = (try? c.decode(Bool.self, forKey: .randomized)) ?? false
    }
    enum K: String, CodingKey { case groupBy, columns, randomSeed, randomized }
}

public struct ArtSave: Codable, Equatable, Sendable {
    public static let version = 1
    public var version = ArtSave.version
    public var completed = 0
    public var dailyHistory: [String: ArtDailyRecord] = [:]
    /// Best time and fewest moves per board level ("3"…"7") in free play.
    public var bests: [String: ArtBest] = [:]
    public var history: [ArtPlayRecord] = []
    public var inProgressDaily: ArtState?
    public var inProgressFree: ArtState?
    public var lastSize = 3
    public var showNumbers = false
    public var gallery = ArtGalleryPrefs()
    public var records: [String: ArtKeyRecord] = [:]
    /// The visitor's own photos ("custom:<id>:<size>"): kept apart from the paintings.
    public var customRecords: [String: ArtKeyRecord] = [:]

    public init() {}

    /// Decoding never fails on a damaged field: that field falls back to its default (nothing else is lost).
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        if let v = try? c.decode(Int.self, forKey: .version), v > ArtSave.version { return } // from a newer app: start fresh
        completed = max(0, (try? c.decode(Int.self, forKey: .completed)) ?? 0)
        dailyHistory = (try? c.decode([String: ArtDailyRecord].self, forKey: .dailyHistory)) ?? [:]
        bests = (try? c.decode([String: ArtBest].self, forKey: .bests)) ?? [:]
        history = Array(((try? c.decode([ArtPlayRecord].self, forKey: .history)) ?? []).suffix(200))
        if let s = try? c.decode(ArtState.self, forKey: .inProgressDaily), s.isValid { inProgressDaily = s }
        if let s = try? c.decode(ArtState.self, forKey: .inProgressFree), s.isValid { inProgressFree = s }
        let ls = (try? c.decode(Int.self, forKey: .lastSize)) ?? 3
        lastSize = artLevels.contains(ls) ? ls : 3
        showNumbers = (try? c.decode(Bool.self, forKey: .showNumbers)) ?? false
        gallery = (try? c.decode(ArtGalleryPrefs.self, forKey: .gallery)) ?? ArtGalleryPrefs()
        records = (try? c.decode([String: ArtKeyRecord].self, forKey: .records)) ?? [:]
        customRecords = (try? c.decode([String: ArtKeyRecord].self, forKey: .customRecords)) ?? [:]
        completed = max(completed, records.values.reduce(0) { $0 + $1.clears })
    }
    enum K: String, CodingKey { case version, completed, dailyHistory, bests, history, inProgressDaily, inProgressFree, lastSize, showNumbers, gallery, records, customRecords }

    public static func recordKey(_ artworkId: String, _ size: Int) -> String { "\(artworkId):\(size)" }

    /// What changed when a puzzle was cleared (so the result screen can say "new best").
    public struct ClearOutcome: Sendable {
        public var newBestTime: Bool; public var newBestMoves: Bool; public var firstClear: Bool
        public init(newBestTime: Bool, newBestMoves: Bool, firstClear: Bool) { self.newBestTime = newBestTime; self.newBestMoves = newBestMoves; self.firstClear = firstClear }
    }

    /// Port of recordArtClear. A photo of the visitor's own gets its own small record and nothing else.
    @discardableResult
    public mutating func recordClear(_ state: ArtState, dateKey: String, now: Double = Date().timeIntervalSince1970 * 1000) -> ClearOutcome {
        let p = state.puzzle
        let key = ArtSave.recordKey(p.artworkId, p.size)
        let old = ArtRules.isCustom(p.artworkId) ? customRecords[key] : records[key]
        let outcome = ClearOutcome(newBestTime: old?.bestTimeMs.map { state.elapsedMs < $0 } ?? true,
                                   newBestMoves: old?.bestMoves.map { state.moves < $0 } ?? true,
                                   firstClear: old == nil)
        let rec = (old ?? ArtKeyRecord()).cleared(timeMs: state.elapsedMs, moves: state.moves, at: now)
        if ArtRules.isCustom(p.artworkId) { customRecords[key] = rec; return outcome }
        records[key] = rec
        completed += 1
        history = Array((history + [ArtPlayRecord(date: dateKey, mode: p.mode, size: p.size, artworkId: p.artworkId, timeMs: state.elapsedMs, moves: state.moves)]).suffix(200))
        if p.mode == .daily {
            if dailyHistory[dateKey] == nil || dailyHistory[dateKey]!.artworkId != p.artworkId {
                dailyHistory[dateKey] = ArtDailyRecord(number: p.number ?? 0, artworkId: p.artworkId, timeMs: state.elapsedMs, moves: state.moves)
            }
        } else {
            bests[String(p.size)] = (bests[String(p.size)] ?? ArtBest()).updated(timeMs: state.elapsedMs, moves: state.moves)
        }
        return outcome
    }
}

public enum ArtStats {
    /// Consecutive cleared daily puzzles ending today (or yesterday, if today is not cleared yet).
    public static func currentDailyStreak(_ history: [String: ArtDailyRecord], today: String) -> Int {
        var day = history[today] != nil ? today : DateKeys.addDays(today, -1)
        var n = 0
        while history[day] != nil { n += 1; day = DateKeys.addDays(day, -1) }
        return n
    }
    public static func maxDailyStreak(_ history: [String: ArtDailyRecord]) -> Int {
        var best = 0, run = 0, prev = ""
        for d in history.keys.sorted() {
            run = (!prev.isEmpty && DateKeys.addDays(d, -1) == prev) ? run + 1 : 1
            best = max(best, run); prev = d
        }
        return best
    }
    /// m:ss (like the web), hours folded into minutes.
    public static func formatTime(_ ms: Int) -> String {
        let s = max(0, ms) / 1000
        return "\(s / 60):\(String(format: "%02d", s % 60))"
    }
}

/// Port of custom/photos.ts limits and pure helpers (the files themselves are handled by the app).
public enum CustomPhotoRules {
    public static let maxPhotos = 20
    public static let maxTotalBytes = 50 * 1024 * 1024
    public static let maxInputBytes = 20 * 1024 * 1024
    public static let maxSide = 1600
    public static let thumbSide = 480
    public enum Problem: Sendable { case limit, quota }

    public static func fitWithin(_ w: Int, _ h: Int, max m: Int) -> (width: Int, height: Int) {
        let k = min(1.0, Double(m) / Double(max(w, h)))
        return (max(1, Int((Double(w) * k).rounded())), max(1, Int((Double(h) * k).rounded())))
    }
    public static func limitProblem(count: Int, usedBytes: Int, extraBytes: Int) -> Problem? {
        if count >= maxPhotos { return .limit }
        if usedBytes + extraBytes > maxTotalBytes { return .quota }
        return nil
    }
    public static func artworkID(_ photoId: String) -> String { "custom:\(photoId)" }
    public static func photoID(_ artworkId: String) -> String { String(artworkId.dropFirst("custom:".count)) }
}
