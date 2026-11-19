import Foundation

public let bigSaveVersion = 1

public struct BigBest: Codable, Sendable, Equatable {
    public var timeMs: Int?
    public var moves: Int?
    public init(timeMs: Int? = nil, moves: Int? = nil) { self.timeMs = timeMs; self.moves = moves }
}

public struct BigDailyRecord: Codable, Sendable, Equatable {
    public var number: Int
    public var timeMs: Int
    public var moves: Int
    public var bigMoves: Int
}

public struct BigPlayRecord: Codable, Sendable, Equatable {
    public var date: String
    public var mode: BigMode
    public var size: Int
    public var variant: BigVariant?
    public var difficulty: BigDifficulty
    public var timeMs: Int
    public var moves: Int
    public var bigMoves: Int
}

/// Unfinished games. Decoding is lenient: a damaged entry is dropped instead of losing the whole save.
public struct BigInProgress: Codable, Sendable, Equatable {
    public var daily: BigState?
    public var endless: BigState?
    public init() {}
    enum CodingKeys: String, CodingKey { case daily, endless }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        daily = try? c.decodeIfPresent(BigState.self, forKey: .daily)
        endless = try? c.decodeIfPresent(BigState.self, forKey: .endless)
    }
}

/// Everything BIG SLIDE remembers (port of storage.ts BigSave).
public struct BigSave: Codable, Sendable, Equatable {
    public var version = bigSaveVersion
    public var completed = 0
    public var dailyHistory: [String: BigDailyRecord] = [:]
    public var endlessStreak = 0
    public var maxEndlessStreak = 0
    /// Keyed by `size-difficulty` (classic) or `variant-size-difficulty`.
    public var bests: [String: BigBest] = [:]
    public var history: [BigPlayRecord] = []
    public var inProgress = BigInProgress()
    public var lastSize = 4
    public var lastDifficulty: BigDifficulty = .normal
    public var lastVariant: BigVariant = .classic

    public init() {}

    enum CodingKeys: String, CodingKey { case version, completed, dailyHistory, endlessStreak, maxEndlessStreak, bests, history, inProgress, lastSize, lastDifficulty, lastVariant }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func get<T: Decodable>(_ k: CodingKeys, _ d: T) -> T { (try? c.decodeIfPresent(T.self, forKey: k)) ?? d }
        completed = get(.completed, 0)
        dailyHistory = get(.dailyHistory, [:])
        endlessStreak = get(.endlessStreak, 0)
        maxEndlessStreak = get(.maxEndlessStreak, 0)
        bests = get(.bests, [:])
        history = get(.history, [])
        inProgress = get(.inProgress, BigInProgress())
        let sz = get(.lastSize, 4)
        lastSize = bigBoardSizes.contains(sz) ? sz : 4
        lastDifficulty = get(.lastDifficulty, .normal)
        lastVariant = get(.lastVariant, .classic)
    }

    public static func bestKey(size: Int, difficulty: BigDifficulty, variant: BigVariant = .classic) -> String {
        variant == .classic ? "\(size)-\(difficulty.rawValue)" : "\(variant.rawValue)-\(size)-\(difficulty.rawValue)"
    }

    /// Drops unfinished games that can no longer be trusted: invalid ones, a daily of another date or generator version.
    public mutating func sanitize(today: String) {
        if let d = inProgress.daily, !(d.isValid && d.puzzle.id == "bigdaily-\(today)" && d.puzzle.generatorVersion == bigGeneratorVersion) { inProgress.daily = nil }
        if let e = inProgress.endless, !e.isValid { inProgress.endless = nil }
    }

    /// Records a cleared game (daily: first clear of the date only; endless: streak and personal best).
    public mutating func recordClear(_ s: BigState, dateKey: String) {
        let p = s.puzzle
        completed += 1
        history.append(BigPlayRecord(date: dateKey, mode: p.mode, size: p.size, variant: p.variant, difficulty: p.difficulty, timeMs: s.elapsedMs, moves: s.moves, bigMoves: s.bigMoves))
        if history.count > 200 { history.removeFirst(history.count - 200) }
        if p.mode == .daily {
            if dailyHistory[dateKey] == nil { dailyHistory[dateKey] = BigDailyRecord(number: p.number ?? 0, timeMs: s.elapsedMs, moves: s.moves, bigMoves: s.bigMoves) }
        } else {
            endlessStreak += 1
            maxEndlessStreak = max(maxEndlessStreak, endlessStreak)
            let k = Self.bestKey(size: p.size, difficulty: p.difficulty, variant: p.variant)
            bests[k] = BigStats.updateBest(bests[k] ?? BigBest(), timeMs: s.elapsedMs, moves: s.moves)
        }
    }
}

/// Streaks, personal bests and time formatting (port of src/storage/stats.ts).
public enum BigStats {
    /// Consecutive cleared daily puzzles ending today (or yesterday, if today is not cleared yet).
    public static func currentDailyStreak(_ history: [String: BigDailyRecord], today: String) -> Int {
        var day = history[today] != nil ? today : DateKeys.addDays(today, -1)
        var n = 0
        while history[day] != nil { n += 1; day = DateKeys.addDays(day, -1) }
        return n
    }

    public static func maxDailyStreak(_ history: [String: BigDailyRecord]) -> Int {
        var best = 0, run = 0
        var prev = ""
        for d in history.keys.sorted() {
            run = (!prev.isEmpty && DateKeys.addDays(d, -1) == prev) ? run + 1 : 1
            best = max(best, run)
            prev = d
        }
        return best
    }

    public static func updateBest(_ b: BigBest, timeMs: Int, moves: Int) -> BigBest {
        BigBest(timeMs: b.timeMs.map { min($0, timeMs) } ?? timeMs, moves: b.moves.map { min($0, moves) } ?? moves)
    }

    public static func formatTime(_ ms: Int) -> String {
        let s = ms / 1000
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }
}
