import Foundation

/// The records of the three games that can be synced between a person's devices (schema 1).
/// NOT included: unfinished puzzles, the visitor's own photos (and their records: photo ids are per device), UI preferences,
/// streak counters that are derived (daily streaks are computed from `dailyHistory` on every read), and purchases.
public struct SyncDocument: Codable, Equatable, Sendable {
    public static let currentSchema = 1
    public var schema: Int
    public var art: ArtRecords
    public var word: WordRecords
    public var big: BigRecords

    public init(schema: Int = SyncDocument.currentSchema, art: ArtRecords = .init(), word: WordRecords = .init(), big: BigRecords = .init()) {
        self.schema = schema; self.art = art; self.word = word; self.big = big
    }

    enum K: String, CodingKey { case schema, art, word, big }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        schema = try c.decode(Int.self, forKey: .schema)
        art = try c.decodeIfPresent(ArtRecords.self, forKey: .art) ?? .init()
        word = try c.decodeIfPresent(WordRecords.self, forKey: .word) ?? .init()
        big = try c.decodeIfPresent(BigRecords.self, forKey: .big) ?? .init()
    }

    public enum DecodeError: Error, Equatable { case newerSchema, corrupt }

    /// Decodes a document received from the server. A newer `schema` (written by a newer app) is reported, never guessed at.
    public static func decode(_ json: String) throws -> SyncDocument {
        guard let data = json.data(using: .utf8) else { throw DecodeError.corrupt }
        struct Probe: Decodable { let schema: Int }
        guard let probe = try? JSONDecoder().decode(Probe.self, from: data) else { throw DecodeError.corrupt }
        if probe.schema > currentSchema { throw DecodeError.newerSchema }
        guard probe.schema >= 1, let doc = try? JSONDecoder().decode(SyncDocument.self, from: data) else { throw DecodeError.corrupt }
        return doc.normalized()
    }

    public func encode() -> String {
        let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]
        return (try? e.encode(self)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    /// Drops values that cannot be real (negative numbers, malformed dates, empty bests) so a damaged remote doc cannot poison the local records.
    public func normalized() -> SyncDocument {
        var d = self
        d.art.normalize(); d.word.normalize(); d.big.normalize()
        return d
    }
}

// MARK: - helpers

enum SyncRules {
    static let historyCap = 200
    static func validDate(_ s: String) -> Bool {
        let b = Array(s.utf8)
        guard b.count == 10, b[4] == 45, b[7] == 45 else { return false }
        return b.enumerated().allSatisfy { i, c in i == 4 || i == 7 || (c >= 48 && c <= 57) }
    }
    static func canonical<T: Encodable>(_ v: T) -> String {
        let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]
        return (try? e.encode(v)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }
    static func minOpt(_ a: Int?, _ b: Int?) -> Int? { switch (a, b) { case let (x?, y?): return min(x, y); case let (x?, nil): return x; case let (nil, y?): return y; default: return nil } }
    static func maxOpt(_ a: Double?, _ b: Double?) -> Double? { switch (a, b) { case let (x?, y?): return max(x, y); case let (x?, nil): return x; case let (nil, y?): return y; default: return nil } }

    /// Union by key; where both sides have the key the `better` one wins. `better` must be a strict total order for the result to be commutative.
    static func unionBest<V>(_ a: [String: V], _ b: [String: V], isBetter: (V, V) -> Bool) -> [String: V] {
        var out = a
        for (k, v) in b { if let cur = out[k] { if isBetter(v, cur) { out[k] = v } } else { out[k] = v } }
        return out
    }
    /// Multiset union (count per record = max of both sides: identical records of two devices are the same play, a repeated one is kept),
    /// ordered by date then content, capped to the newest `historyCap`.
    static func unionHistory<R: Encodable>(_ a: [R], _ b: [R], date: (R) -> String) -> [R] {
        func counts(_ x: [R]) -> [String: (n: Int, r: R)] {
            var m: [String: (n: Int, r: R)] = [:]
            for r in x { let k = canonical(r); m[k] = ((m[k]?.n ?? 0) + 1, r) }
            return m
        }
        let ca = counts(a), cb = counts(b)
        var items: [(date: String, key: String, r: R)] = []
        for k in Set(ca.keys).union(cb.keys) {
            let rec = (ca[k] ?? cb[k]!).r
            for _ in 0..<max(ca[k]?.n ?? 0, cb[k]?.n ?? 0) { items.append((date(rec), k, rec)) }
        }
        items.sort { ($0.date, $0.key) < ($1.date, $1.key) }
        return items.suffix(historyCap).map(\.r)
    }
    static func sortedCapped<R: Encodable>(_ x: [R], date: (R) -> String) -> [R] { unionHistory(x, [], date: date) }
}

// MARK: - ART SLIDE

public struct ArtRecords: Codable, Equatable, Sendable {
    public var completed = 0
    public var dailyHistory: [String: ArtDailyRecord] = [:]
    public var bests: [String: ArtBest] = [:]
    public var history: [ArtPlayRecord] = []
    /// "<paintingId>:<size>" (the visitor's own photos are not here)
    public var records: [String: ArtKeyRecord] = [:]
    public init() {}
    public init(_ s: ArtSave) { completed = s.completed; dailyHistory = s.dailyHistory; bests = s.bests; history = s.history; records = s.records; normalize() }
    enum K: String, CodingKey { case completed, dailyHistory, bests, history, records }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        completed = (try? c.decodeIfPresent(Int.self, forKey: .completed)) ?? 0
        dailyHistory = (try? c.decodeIfPresent([String: ArtDailyRecord].self, forKey: .dailyHistory)) ?? [:]
        bests = (try? c.decodeIfPresent([String: ArtBest].self, forKey: .bests)) ?? [:]
        history = (try? c.decodeIfPresent([ArtPlayRecord].self, forKey: .history)) ?? []
        records = (try? c.decodeIfPresent([String: ArtKeyRecord].self, forKey: .records)) ?? [:]
    }
    mutating func normalize() {
        dailyHistory = dailyHistory.filter { SyncRules.validDate($0.key) && $0.value.timeMs >= 0 && $0.value.moves >= 0 }
        bests = bests.filter { $0.value.timeMs != nil || $0.value.moves != nil }
        records = records.filter { $0.value.clears >= 0 }
        history = SyncRules.sortedCapped(history.filter { SyncRules.validDate($0.date) }, date: \.date)
        completed = max(0, completed, records.values.reduce(0) { $0 + $1.clears })
    }
    /// Writes these records into a save, leaving the unfinished puzzles, preferences and the visitor's photo records alone.
    public func apply(to s: inout ArtSave) {
        s.completed = completed; s.dailyHistory = dailyHistory; s.bests = bests; s.history = history; s.records = records
    }
}

// MARK: - WORD SLIDE

public struct WordRecords: Codable, Equatable, Sendable {
    public var completed = 0
    public var noHintClears = 0
    public var maxEndlessStreak = 0
    public var dailyHistory: [String: WordDailyRecord] = [:]
    /// keyed by difficulty raw value ("easy", "normal", "hard")
    public var bests: [String: WordBest] = [:]
    public var history: [WordPlayRecord] = []
    public init() {}
    public init(_ s: WordSave) {
        completed = s.completed; noHintClears = s.noHintClears; maxEndlessStreak = max(s.maxEndlessStreak, s.endlessStreak)
        dailyHistory = s.dailyHistory; history = s.history
        for (k, v) in s.bests { bests[k.rawValue] = v }
        normalize()
    }
    enum K: String, CodingKey { case completed, noHintClears, maxEndlessStreak, dailyHistory, bests, history }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        completed = (try? c.decodeIfPresent(Int.self, forKey: .completed)) ?? 0
        noHintClears = (try? c.decodeIfPresent(Int.self, forKey: .noHintClears)) ?? 0
        maxEndlessStreak = (try? c.decodeIfPresent(Int.self, forKey: .maxEndlessStreak)) ?? 0
        dailyHistory = (try? c.decodeIfPresent([String: WordDailyRecord].self, forKey: .dailyHistory)) ?? [:]
        bests = (try? c.decodeIfPresent([String: WordBest].self, forKey: .bests)) ?? [:]
        history = (try? c.decodeIfPresent([WordPlayRecord].self, forKey: .history)) ?? []
    }
    mutating func normalize() {
        completed = max(0, completed); noHintClears = max(0, noHintClears); maxEndlessStreak = max(0, maxEndlessStreak)
        dailyHistory = dailyHistory.filter { SyncRules.validDate($0.key) && $0.value.timeMs >= 0 && $0.value.moves >= 0 }
        bests = bests.filter { WordDifficulty(rawValue: $0.key) != nil && ($0.value.timeMs != nil || $0.value.moves != nil) }
        history = SyncRules.sortedCapped(history.filter { SyncRules.validDate($0.date) }, date: \.date)
    }
    /// The current endless streak is per device and never replaced; only the best-ever streak is raised.
    public func apply(to s: inout WordSave) {
        s.completed = completed; s.noHintClears = noHintClears
        s.maxEndlessStreak = max(maxEndlessStreak, s.endlessStreak)
        s.dailyHistory = dailyHistory; s.history = history
        for d in WordDifficulty.allCases { s.bests[d] = bests[d.rawValue] ?? WordBest() }
    }
}

// MARK: - BIG SLIDE

public struct BigRecords: Codable, Equatable, Sendable {
    public var completed = 0
    public var maxEndlessStreak = 0
    public var dailyHistory: [String: BigDailyRecord] = [:]
    public var bests: [String: BigBest] = [:]
    public var history: [BigPlayRecord] = []
    public init() {}
    public init(_ s: BigSave) {
        completed = s.completed; maxEndlessStreak = max(s.maxEndlessStreak, s.endlessStreak)
        dailyHistory = s.dailyHistory; bests = s.bests; history = s.history
        normalize()
    }
    enum K: String, CodingKey { case completed, maxEndlessStreak, dailyHistory, bests, history }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        completed = (try? c.decodeIfPresent(Int.self, forKey: .completed)) ?? 0
        maxEndlessStreak = (try? c.decodeIfPresent(Int.self, forKey: .maxEndlessStreak)) ?? 0
        dailyHistory = (try? c.decodeIfPresent([String: BigDailyRecord].self, forKey: .dailyHistory)) ?? [:]
        bests = (try? c.decodeIfPresent([String: BigBest].self, forKey: .bests)) ?? [:]
        history = (try? c.decodeIfPresent([BigPlayRecord].self, forKey: .history)) ?? []
    }
    mutating func normalize() {
        completed = max(0, completed); maxEndlessStreak = max(0, maxEndlessStreak)
        dailyHistory = dailyHistory.filter { SyncRules.validDate($0.key) && $0.value.timeMs >= 0 && $0.value.moves >= 0 }
        bests = bests.filter { $0.value.timeMs != nil || $0.value.moves != nil }
        history = SyncRules.sortedCapped(history.filter { SyncRules.validDate($0.date) }, date: \.date)
    }
    public func apply(to s: inout BigSave) {
        s.completed = completed
        s.maxEndlessStreak = max(maxEndlessStreak, s.endlessStreak)
        s.dailyHistory = dailyHistory; s.bests = bests; s.history = history
    }
}

// MARK: - merge (pure; commutative, associative, idempotent)

public enum SyncMerge {
    public static func document(_ local: SyncDocument, _ remote: SyncDocument) -> SyncDocument {
        SyncDocument(schema: SyncDocument.currentSchema, art: art(local.art, remote.art), word: word(local.word, remote.word), big: big(local.big, remote.big))
    }

    public static func art(_ a: ArtRecords, _ b: ArtRecords) -> ArtRecords {
        var m = ArtRecords()
        // a date keeps the better clear: lower time, then fewer moves (then fixed tie-breaks so the order is total)
        m.dailyHistory = SyncRules.unionBest(a.dailyHistory, b.dailyHistory) { x, y in
            (x.timeMs, x.moves, x.artworkId, x.number) < (y.timeMs, y.moves, y.artworkId, y.number) }
        m.bests = mergeBests(a.bests, b.bests, ArtBest.init(timeMs:moves:), { ($0.timeMs, $0.moves) })
        var recs: [String: ArtKeyRecord] = [:]
        for k in Set(a.records.keys).union(b.records.keys) {
            switch (a.records[k], b.records[k]) {
            case let (x?, y?): recs[k] = ArtKeyRecord(bestTimeMs: SyncRules.minOpt(x.bestTimeMs, y.bestTimeMs), bestMoves: SyncRules.minOpt(x.bestMoves, y.bestMoves),
                                                    clears: max(x.clears, y.clears), lastClearedAt: SyncRules.maxOpt(x.lastClearedAt, y.lastClearedAt))
            case let (x?, nil): recs[k] = x
            case let (nil, y?): recs[k] = y
            default: break
            }
        }
        m.records = recs
        m.history = SyncRules.unionHistory(a.history, b.history, date: \.date)
        // never less than either side, and at least the clears the merged per-painting records add up to (the app's own load rule)
        m.completed = max(a.completed, b.completed, recs.values.reduce(0) { $0 + $1.clears })
        return m
    }

    public static func word(_ a: WordRecords, _ b: WordRecords) -> WordRecords {
        var m = WordRecords()
        m.completed = max(a.completed, b.completed)
        m.noHintClears = max(a.noHintClears, b.noHintClears)
        m.maxEndlessStreak = max(a.maxEndlessStreak, b.maxEndlessStreak)
        m.dailyHistory = SyncRules.unionBest(a.dailyHistory, b.dailyHistory) { x, y in
            (x.timeMs, x.moves, x.checks, x.hints, x.number) < (y.timeMs, y.moves, y.checks, y.hints, y.number) }
        m.bests = mergeBests(a.bests, b.bests, { t, mv in var w = WordBest(); w.timeMs = t; w.moves = mv; return w }, { ($0.timeMs, $0.moves) })
        m.history = SyncRules.unionHistory(a.history, b.history, date: \.date)
        return m
    }

    public static func big(_ a: BigRecords, _ b: BigRecords) -> BigRecords {
        var m = BigRecords()
        m.completed = max(a.completed, b.completed)
        m.maxEndlessStreak = max(a.maxEndlessStreak, b.maxEndlessStreak)
        m.dailyHistory = SyncRules.unionBest(a.dailyHistory, b.dailyHistory) { x, y in
            (x.timeMs, x.moves, x.bigMoves, x.number) < (y.timeMs, y.moves, y.bigMoves, y.number) }
        m.bests = mergeBests(a.bests, b.bests, BigBest.init(timeMs:moves:), { ($0.timeMs, $0.moves) })
        m.history = SyncRules.unionHistory(a.history, b.history, date: \.date)
        return m
    }

    /// Per key: best time and fewest moves are taken independently (they may come from different runs, as in the app).
    private static func mergeBests<V>(_ a: [String: V], _ b: [String: V], _ make: (Int?, Int?) -> V, _ f: (V) -> (Int?, Int?)) -> [String: V] {
        var out: [String: V] = [:]
        for k in Set(a.keys).union(b.keys) {
            let x = a[k].map(f), y = b[k].map(f)
            let t = SyncRules.minOpt(x?.0, y?.0), mv = SyncRules.minOpt(x?.1, y?.1)
            if t == nil && mv == nil { continue }
            out[k] = make(t, mv)
        }
        return out
    }
}
