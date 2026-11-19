import Foundation

public struct WordDailyRecord: Codable, Equatable, Sendable {
    public var number: Int
    public var timeMs: Int
    public var moves: Int
    public var checks: Int
    public var hints: Int = 0
}

public struct WordPlayRecord: Codable, Equatable, Sendable {
    public var date: String
    public var noHint: Bool = false
    public var hints: Int = 0
    public var mode: WordMode
    public var difficulty: WordDifficulty
    public var timeMs: Int
    public var moves: Int
    public var checks: Int
}

public struct WordBest: Codable, Equatable, Sendable {
    public var timeMs: Int?
    public var moves: Int?
    public init() {}
}

public struct WordInProgress: Codable, Equatable, Sendable {
    public var daily: WordGameState?
    public var endless: WordGameState?
}

/// Port of src/storage (save shape + stats). Language / theme / colour-blind are app-wide (AppModel), not here.
public struct WordSave: Codable, Equatable, Sendable {
    public var completed = 0
    public var noHintClears = 0
    public var dailyHistory: [String: WordDailyRecord] = [:]
    public var endlessStreak = 0
    public var maxEndlessStreak = 0
    public var bests: [WordDifficulty: WordBest] = [.easy: WordBest(), .normal: WordBest(), .hard: WordBest()]
    public var history: [WordPlayRecord] = []
    public var inProgress = WordInProgress()
    public var lastDifficulty: WordDifficulty = .normal
    public init() {}

    /// Drop saved games that cannot be restored (damaged, other word list / generator, wrong day).
    public mutating func sanitize(wordsVersion: String, today: String) {
        if let d = inProgress.daily, !(d.isValid && d.puzzle.id == "daily-\(today)" && d.puzzle.wordsVersion == wordsVersion && d.puzzle.generatorVersion == WordConst.generatorVersion) { inProgress.daily = nil }
        if let e = inProgress.endless, !(e.isValid && e.puzzle.wordsVersion == wordsVersion && e.puzzle.generatorVersion == WordConst.generatorVersion) { inProgress.endless = nil }
        for d in WordDifficulty.allCases where bests[d] == nil { bests[d] = WordBest() }
    }

    public struct Clear: Sendable {
        public var mode: WordMode
        public var difficulty: WordDifficulty
        public var dateKey: String
        public var number: Int?
        public var timeMs: Int
        public var moves: Int
        public var checks: Int
        public var hints: Int = 0
        public var noHint: Bool = false
        public init(mode: WordMode, difficulty: WordDifficulty, dateKey: String, number: Int? = nil, timeMs: Int, moves: Int, checks: Int, hints: Int = 0, noHint: Bool = false) {
            self.mode = mode; self.difficulty = difficulty; self.dateKey = dateKey; self.number = number
            self.timeMs = timeMs; self.moves = moves; self.checks = checks; self.hints = hints; self.noHint = noHint
        }
    }

    public mutating func recordClear(_ r: Clear) {
        completed += 1
        if r.noHint { noHintClears += 1 }
        history.append(WordPlayRecord(date: r.dateKey, noHint: r.noHint, hints: r.hints, mode: r.mode, difficulty: r.difficulty, timeMs: r.timeMs, moves: r.moves, checks: r.checks))
        if history.count > 200 { history.removeFirst(history.count - 200) }
        if r.mode == .daily {
            if dailyHistory[r.dateKey] == nil {
                dailyHistory[r.dateKey] = WordDailyRecord(number: r.number ?? 0, timeMs: r.timeMs, moves: r.moves, checks: r.checks, hints: r.hints)
            }
        } else {
            endlessStreak += 1
            maxEndlessStreak = max(maxEndlessStreak, endlessStreak)
            var b = bests[r.difficulty] ?? WordBest()
            b.timeMs = min(b.timeMs ?? r.timeMs, r.timeMs)
            b.moves = min(b.moves ?? r.moves, r.moves)
            bests[r.difficulty] = b
        }
    }

    /// Consecutive cleared dailies ending today (or yesterday if today is not cleared yet).
    public func currentDailyStreak(today: String) -> Int {
        var day = dailyHistory[today] != nil ? today : DateKeys.addDays(today, -1)
        var n = 0
        while dailyHistory[day] != nil { n += 1; day = DateKeys.addDays(day, -1) }
        return n
    }

    public var maxDailyStreak: Int { Self.maxStreak(Array(dailyHistory.keys)) }

    public static func maxStreak(_ keys: [String]) -> Int {
        var best = 0, run = 0
        var prev = ""
        for d in keys.sorted() {
            run = (!prev.isEmpty && DateKeys.addDays(d, -1) == prev) ? run + 1 : 1
            best = max(best, run)
            prev = d
        }
        return best
    }
}

public func wordFormatTime(_ ms: Int) -> String {
    let s = ms / 1000
    return "\(s / 60):" + String(format: "%02d", s % 60)
}
