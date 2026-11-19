import XCTest
@testable import SlideCore

// MARK: - fixtures

private struct LCG: RandomNumberGenerator {
    var s: UInt64
    mutating func next() -> UInt64 { s = s &* 6364136223846793005 &+ 1442695040888963407; return s ^ (s >> 29) }
}

private func date(_ i: Int) -> String { DateKeys.addDays("2026-11-01", i) }

private func randArt(_ g: inout LCG) -> ArtRecords {
    var r = ArtRecords()
    for i in 0..<Int.random(in: 0...6, using: &g) where Bool.random(using: &g) {
        r.dailyHistory[date(i)] = ArtDailyRecord(number: i + 1, artworkId: ["a", "b"].randomElement(using: &g)!, timeMs: Int.random(in: 1...5, using: &g) * 1000, moves: Int.random(in: 1...4, using: &g))
    }
    for k in ["3", "4", "5"] where Bool.random(using: &g) { r.bests[k] = ArtBest(timeMs: Bool.random(using: &g) ? Int.random(in: 1...9, using: &g) : nil, moves: Int.random(in: 1...9, using: &g)) }
    for k in ["p1:3", "p2:4", "p3:5"] where Bool.random(using: &g) {
        r.records[k] = ArtKeyRecord(bestTimeMs: Int.random(in: 1...9, using: &g), bestMoves: Int.random(in: 1...9, using: &g), clears: Int.random(in: 1...5, using: &g), lastClearedAt: Bool.random(using: &g) ? Double(Int.random(in: 1...9, using: &g)) : nil)
    }
    for _ in 0..<Int.random(in: 0...5, using: &g) {
        r.history.append(ArtPlayRecord(date: date(Int.random(in: 0...4, using: &g)), mode: .endless, size: 3, artworkId: "p1", timeMs: Int.random(in: 1...3, using: &g), moves: Int.random(in: 1...3, using: &g)))
    }
    r.completed = Int.random(in: 0...8, using: &g)
    r.normalize()
    return r
}

private func randWord(_ g: inout LCG) -> WordRecords {
    var r = WordRecords()
    for i in 0..<Int.random(in: 0...6, using: &g) where Bool.random(using: &g) {
        r.dailyHistory[date(i)] = WordDailyRecord(number: i + 1, timeMs: Int.random(in: 1...5, using: &g), moves: Int.random(in: 1...4, using: &g), checks: Int.random(in: 0...2, using: &g), hints: Int.random(in: 0...2, using: &g))
    }
    for d in WordDifficulty.allCases where Bool.random(using: &g) { var b = WordBest(); b.timeMs = Int.random(in: 1...9, using: &g); if Bool.random(using: &g) { b.moves = Int.random(in: 1...9, using: &g) }; r.bests[d.rawValue] = b }
    for _ in 0..<Int.random(in: 0...5, using: &g) {
        r.history.append(WordPlayRecord(date: date(Int.random(in: 0...4, using: &g)), noHint: Bool.random(using: &g), hints: 0, mode: .endless, difficulty: .normal, timeMs: Int.random(in: 1...3, using: &g), moves: Int.random(in: 1...3, using: &g), checks: 0))
    }
    r.completed = Int.random(in: 0...8, using: &g); r.noHintClears = Int.random(in: 0...4, using: &g); r.maxEndlessStreak = Int.random(in: 0...5, using: &g)
    return r
}

private func randBig(_ g: inout LCG) -> BigRecords {
    var r = BigRecords()
    for i in 0..<Int.random(in: 0...6, using: &g) where Bool.random(using: &g) {
        r.dailyHistory[date(i)] = BigDailyRecord(number: i + 1, timeMs: Int.random(in: 1...5, using: &g), moves: Int.random(in: 1...4, using: &g), bigMoves: Int.random(in: 0...2, using: &g))
    }
    for k in ["4-normal", "duo-5-hard"] where Bool.random(using: &g) { r.bests[k] = BigBest(timeMs: Int.random(in: 1...9, using: &g), moves: Bool.random(using: &g) ? Int.random(in: 1...9, using: &g) : nil) }
    for _ in 0..<Int.random(in: 0...5, using: &g) {
        r.history.append(BigPlayRecord(date: date(Int.random(in: 0...4, using: &g)), mode: .endless, size: 4, variant: nil, difficulty: .normal, timeMs: Int.random(in: 1...3, using: &g), moves: Int.random(in: 1...3, using: &g), bigMoves: 0))
    }
    r.completed = Int.random(in: 0...8, using: &g); r.maxEndlessStreak = Int.random(in: 0...5, using: &g)
    return r
}

private func randDoc(_ g: inout LCG) -> SyncDocument { SyncDocument(art: randArt(&g), word: randWord(&g), big: randBig(&g)).normalized() }

// MARK: - merge laws

final class SyncTestsMerge: XCTestCase {
    func testLawsOnRandomDocuments() {
        var g = LCG(s: 42)
        for _ in 0..<300 {
            let a = randDoc(&g), b = randDoc(&g), c = randDoc(&g)
            let m = SyncMerge.document
            XCTAssertEqual(m(a, a), a, "idempotent")
            XCTAssertEqual(m(a, b), m(b, a), "commutative")
            XCTAssertEqual(m(m(a, b), c), m(a, m(b, c)), "associative")
            XCTAssertEqual(m(m(a, b), b), m(a, b), "re-merging the same remote changes nothing (no double count)")
            XCTAssertEqual(m(a, SyncDocument()), a, "an empty remote changes nothing")
        }
    }

    func testHistoryCapAssociative() {
        func recs(_ range: Range<Int>) -> [ArtPlayRecord] { range.map { ArtPlayRecord(date: date($0 % 400), mode: .endless, size: 3, artworkId: "p", timeMs: $0 + 1, moves: 1) } }
        var a = ArtRecords(), b = ArtRecords(), c = ArtRecords()
        a.history = recs(0..<150); b.history = recs(100..<260); c.history = recs(240..<400)
        let l = SyncMerge.art(SyncMerge.art(a, b), c), r = SyncMerge.art(a, SyncMerge.art(b, c))
        XCTAssertEqual(l, r)
        XCTAssertEqual(l.history.count, 200)
        XCTAssertEqual(SyncMerge.art(a, b).history.count, 200)
    }

    func testDailyKeepsBetterClearAndUnionsDates() {
        var a = ArtRecords(), b = ArtRecords()
        a.dailyHistory["2026-11-02"] = ArtDailyRecord(number: 2, artworkId: "x", timeMs: 9000, moves: 30)
        a.dailyHistory["2026-11-03"] = ArtDailyRecord(number: 3, artworkId: "y", timeMs: 5000, moves: 20)
        b.dailyHistory["2026-11-02"] = ArtDailyRecord(number: 2, artworkId: "x", timeMs: 7000, moves: 40)
        b.dailyHistory["2026-11-03"] = ArtDailyRecord(number: 3, artworkId: "y", timeMs: 5000, moves: 15)
        b.dailyHistory["2026-11-04"] = ArtDailyRecord(number: 4, artworkId: "z", timeMs: 1, moves: 1)
        let m = SyncMerge.art(a, b)
        XCTAssertEqual(m.dailyHistory.keys.sorted(), ["2026-11-02", "2026-11-03", "2026-11-04"])
        XCTAssertEqual(m.dailyHistory["2026-11-02"]?.timeMs, 7000)   // lower time wins even with more moves
        XCTAssertEqual(m.dailyHistory["2026-11-03"]?.moves, 15)      // same time: fewer moves
    }

    func testBestsPerKeyMinimumIndependentOfEachOther() {
        var a = BigRecords(), b = BigRecords()
        a.bests["4-normal"] = BigBest(timeMs: 100, moves: 50)
        b.bests["4-normal"] = BigBest(timeMs: 120, moves: 40)
        b.bests["5-hard"] = BigBest(timeMs: 9, moves: nil)
        let m = SyncMerge.big(a, b)
        XCTAssertEqual(m.bests["4-normal"], BigBest(timeMs: 100, moves: 40))
        XCTAssertEqual(m.bests["5-hard"], BigBest(timeMs: 9, moves: nil))
    }

    func testCountersAreMaxNotSum() {
        var a = WordRecords(), b = WordRecords()
        a.completed = 7; b.completed = 5; a.noHintClears = 2; b.noHintClears = 3; a.maxEndlessStreak = 4; b.maxEndlessStreak = 9
        let m = SyncMerge.word(a, b)
        XCTAssertEqual(m.completed, 7); XCTAssertEqual(m.noHintClears, 3); XCTAssertEqual(m.maxEndlessStreak, 9)
        XCTAssertEqual(SyncMerge.word(m, b), m) // syncing the same remote again never adds
    }

    func testArtClearsAreMaxPerPaintingAndCompletedCoversThem() {
        var a = ArtRecords(), b = ArtRecords()
        a.records["p:3"] = ArtKeyRecord(bestTimeMs: 10, bestMoves: 20, clears: 3, lastClearedAt: 5)
        b.records["p:3"] = ArtKeyRecord(bestTimeMs: 12, bestMoves: 18, clears: 2, lastClearedAt: 9)
        b.records["q:4"] = ArtKeyRecord(bestTimeMs: 1, bestMoves: 1, clears: 4, lastClearedAt: 1)
        a.completed = 3; b.completed = 6
        let m = SyncMerge.art(a, b)
        XCTAssertEqual(m.records["p:3"], ArtKeyRecord(bestTimeMs: 10, bestMoves: 18, clears: 3, lastClearedAt: 9))
        XCTAssertEqual(m.records["q:4"]?.clears, 4)
        XCTAssertEqual(m.completed, 7) // 3 + 4 distinct paintings' clears (> both counters)
        XCTAssertGreaterThanOrEqual(m.completed, max(a.completed, b.completed))
    }

    func testStreaksFollowMergedDailyHistory() {
        var a = WordRecords(), b = WordRecords()
        for d in ["2026-11-01", "2026-11-02"] { a.dailyHistory[d] = WordDailyRecord(number: 1, timeMs: 1, moves: 1, checks: 0) }
        for d in ["2026-11-03", "2026-11-04"] { b.dailyHistory[d] = WordDailyRecord(number: 1, timeMs: 1, moves: 1, checks: 0) }
        var s = WordSave(); WordRecords.init().apply(to: &s)
        SyncMerge.word(a, b).apply(to: &s)
        XCTAssertEqual(s.currentDailyStreak(today: "2026-11-04"), 4)
        XCTAssertEqual(s.maxDailyStreak, 4)
    }

    func testNoClearIsEverLost() {
        var g = LCG(s: 7)
        for _ in 0..<100 {
            let a = randDoc(&g), b = randDoc(&g)
            let m = SyncMerge.document(a, b)
            for (k, v) in a.art.dailyHistory + b.art.dailyHistory { XCTAssertNotNil(m.art.dailyHistory[k]); XCTAssertLessThanOrEqual(m.art.dailyHistory[k]!.timeMs, v.timeMs) }
            for (k, v) in a.big.dailyHistory + b.big.dailyHistory { XCTAssertLessThanOrEqual(m.big.dailyHistory[k]!.timeMs, v.timeMs) }
            for (k, v) in a.art.records + b.art.records { XCTAssertGreaterThanOrEqual(m.art.records[k]!.clears, v.clears) }
            XCTAssertGreaterThanOrEqual(m.word.completed, max(a.word.completed, b.word.completed))
            XCTAssertGreaterThanOrEqual(m.art.completed, max(a.art.completed, b.art.completed))
        }
    }
}

private func + <K, V>(a: [K: V], b: [K: V]) -> [(K, V)] { Array(a) + Array(b) }

// MARK: - document / save mapping

final class SyncTestsDocument: XCTestCase {
    func testRoundTripAndSortedKeys() throws {
        var g = LCG(s: 3)
        let d = randDoc(&g)
        XCTAssertEqual(try SyncDocument.decode(d.encode()), d)
        XCTAssertEqual(d.encode(), d.encode())
        XCTAssertTrue(d.encode().contains("\"schema\":1"))
    }

    func testNewerSchemaIsReportedAndGarbageIsCorrupt() {
        XCTAssertThrowsError(try SyncDocument.decode(#"{"schema":2,"art":{"future":true}}"#)) { XCTAssertEqual($0 as? SyncDocument.DecodeError, .newerSchema) }
        XCTAssertThrowsError(try SyncDocument.decode("not json")) { XCTAssertEqual($0 as? SyncDocument.DecodeError, .corrupt) }
        XCTAssertThrowsError(try SyncDocument.decode(#"{"art":{}}"#)) { XCTAssertEqual($0 as? SyncDocument.DecodeError, .corrupt) }
        XCTAssertThrowsError(try SyncDocument.decode(#"{"schema":0}"#)) { XCTAssertEqual($0 as? SyncDocument.DecodeError, .corrupt) }
    }

    func testDecodeToleratesUnknownFieldsAndDropsBadValues() throws {
        let d = try SyncDocument.decode(#"{"schema":1,"extra":1,"word":{"completed":-4,"dailyHistory":{"garbage":{"number":1,"timeMs":1,"moves":1,"checks":0,"hints":0},"2026-11-01":{"number":1,"timeMs":1,"moves":1,"checks":0,"hints":0}},"bests":{"nope":{"timeMs":1}}}}"#)
        XCTAssertEqual(d.word.completed, 0)
        XCTAssertEqual(d.word.dailyHistory.keys.sorted(), ["2026-11-01"])
        XCTAssertTrue(d.word.bests.isEmpty)
    }

    func testApplyKeepsProgressPreferencesAndOwnPhotos() {
        var s = ArtSave()
        s.lastSize = 5; s.showNumbers = true
        s.customRecords["custom:x:3"] = ArtKeyRecord(bestTimeMs: 1, bestMoves: 1, clears: 1)
        var r = ArtRecords(); r.records["p:3"] = ArtKeyRecord(bestTimeMs: 5, bestMoves: 5, clears: 2); r.completed = 2
        r.apply(to: &s)
        XCTAssertEqual(s.lastSize, 5); XCTAssertTrue(s.showNumbers)
        XCTAssertEqual(s.customRecords.count, 1)
        XCTAssertEqual(s.records["p:3"]?.clears, 2)
        XCTAssertNil(ArtRecords(s).records["custom:x:3"])

        var w = WordSave(); w.endlessStreak = 6; w.lastDifficulty = .hard
        var wr = WordRecords(); wr.maxEndlessStreak = 2
        wr.apply(to: &w)
        XCTAssertEqual(w.endlessStreak, 6); XCTAssertEqual(w.maxEndlessStreak, 6); XCTAssertEqual(w.lastDifficulty, .hard)
        XCTAssertEqual(w.bests.count, 3)
    }

    func testNonceHashIsLowercaseHexSHA256() {
        XCTAssertEqual(AppleNonce.sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        let n = AppleNonce.random()
        XCTAssertEqual(n.count, 64)
        XCTAssertNotEqual(n, AppleNonce.random())
    }
}

// MARK: - engine

final class FakeLocal: SyncLocalStore {
    var doc: SyncDocument
    var writes = 0
    var failWrite = false
    var onRead: (() -> Void)?
    init(_ d: SyncDocument = SyncDocument()) { doc = d }
    func read() -> SyncDocument { onRead?(); return doc }
    func write(_ d: SyncDocument) -> Bool { if failWrite { return false }; writes += 1; doc = d; return true }
}

final class FakeNet: SyncTransport, @unchecked Sendable {
    var version = 0
    var doc: String?
    var fetchError: SyncError?
    var pushError: SyncError?
    var conflictsBeforeAccept = 0
    var pushes: [(Int, String)] = []
    /// What another device writes between our fetch and push (each conflict).
    var intruder: (() -> SyncDocument)?
    func fetch() async throws -> RemoteSync { if let e = fetchError { throw e }; return RemoteSync(version: version, doc: doc) }
    func push(baseVersion: Int, doc d: String) async throws -> PushResult {
        if let e = pushError { throw e }
        pushes.append((baseVersion, d))
        if conflictsBeforeAccept > 0 || baseVersion != version {
            if conflictsBeforeAccept > 0 { conflictsBeforeAccept -= 1; if let i = intruder { doc = i().encode() }; version += 1 }
            return .conflict(RemoteSync(version: version, doc: doc))
        }
        version += 1; doc = d
        return .ok(version: version)
    }
}

private func docWith(daily: [String: Int] = [:], wordCompleted: Int = 0) -> SyncDocument {
    var d = SyncDocument()
    for (k, t) in daily { d.big.dailyHistory[k] = BigDailyRecord(number: 1, timeMs: t, moves: 1, bigMoves: 0) }
    d.word.completed = wordCompleted
    return d
}

@MainActor
final class SyncTestsEngine: XCTestCase {
    func testFirstSyncPushesLocalAndWritesNothing() async throws {
        let local = FakeLocal(docWith(daily: ["2026-11-01": 5]))
        let net = FakeNet()
        let r = try await SyncEngine(transport: net, local: local).run()
        XCTAssertTrue(r.pushed); XCTAssertFalse(r.changedLocal); XCTAssertEqual(local.writes, 0)
        XCTAssertEqual(net.pushes.count, 1); XCTAssertEqual(net.pushes[0].0, 0)
        XCTAssertEqual(try SyncDocument.decode(net.doc!), local.doc)
    }

    func testMergesRemoteIntoLocalAndPushesTheUnion() async throws {
        let local = FakeLocal(docWith(daily: ["2026-11-01": 5, "2026-11-02": 9]))
        let net = FakeNet(); net.version = 4; net.doc = docWith(daily: ["2026-11-02": 7, "2026-11-03": 1], wordCompleted: 3).encode()
        let r = try await SyncEngine(transport: net, local: local).run()
        XCTAssertTrue(r.changedLocal)
        XCTAssertEqual(local.doc.big.dailyHistory.keys.sorted(), ["2026-11-01", "2026-11-02", "2026-11-03"])
        XCTAssertEqual(local.doc.big.dailyHistory["2026-11-02"]?.timeMs, 7)
        XCTAssertEqual(local.doc.word.completed, 3)
        XCTAssertEqual(net.pushes[0].0, 4)
        XCTAssertEqual(try SyncDocument.decode(net.doc!), local.doc)
    }

    func testSecondRunWithNothingNewDoesNotPushOrWrite() async throws {
        let local = FakeLocal(docWith(daily: ["2026-11-01": 5]))
        let net = FakeNet()
        let e = SyncEngine(transport: net, local: local)
        _ = try await e.run()
        let r = try await e.run()
        XCTAssertFalse(r.pushed); XCTAssertFalse(r.changedLocal)
        XCTAssertEqual(net.pushes.count, 1)
    }

    func testConflictIsMergedAndRetried() async throws {
        let local = FakeLocal(docWith(daily: ["2026-11-01": 5]))
        let net = FakeNet(); net.version = 1; net.doc = docWith(daily: ["2026-11-02": 5]).encode()
        net.conflictsBeforeAccept = 2
        net.intruder = { docWith(daily: ["2026-11-02": 5, "2026-11-09": 2]) }
        let r = try await SyncEngine(transport: net, local: local).run()
        XCTAssertTrue(r.pushed)
        XCTAssertEqual(net.pushes.count, 3)
        XCTAssertEqual(local.doc.big.dailyHistory.keys.sorted(), ["2026-11-01", "2026-11-02", "2026-11-09"])
        XCTAssertEqual(try SyncDocument.decode(net.doc!), local.doc)
    }

    func testGivesUpAfterThreeRetries() async {
        let local = FakeLocal(docWith(daily: ["2026-11-01": 5]))
        let net = FakeNet(); net.conflictsBeforeAccept = 99
        do { _ = try await SyncEngine(transport: net, local: local).run(); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? SyncError, .tooManyConflicts) }
        XCTAssertEqual(net.pushes.count, 4) // first try + 3 retries
        XCTAssertEqual(local.doc.big.dailyHistory["2026-11-01"]?.timeMs, 5) // local untouched in value
    }

    func testNewerSchemaTouchesNothing() async {
        let local = FakeLocal(docWith(daily: ["2026-11-01": 5]))
        let net = FakeNet(); net.version = 3; net.doc = #"{"schema":2,"big":{"dailyHistory":{}}}"#
        do { _ = try await SyncEngine(transport: net, local: local).run(); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? SyncError, .newerSchema) }
        XCTAssertEqual(local.writes, 0); XCTAssertTrue(net.pushes.isEmpty)
    }

    func testNewerSchemaInConflictAnswerAlsoStops() async {
        let local = FakeLocal(docWith(daily: ["2026-11-01": 5]))
        let net = FakeNet(); net.conflictsBeforeAccept = 1
        net.intruder = nil
        // the conflict answer carries a doc of a newer format
        final class T: SyncTransport, @unchecked Sendable {
            func fetch() async throws -> RemoteSync { RemoteSync(version: 0, doc: nil) }
            func push(baseVersion: Int, doc: String) async throws -> PushResult { .conflict(RemoteSync(version: 1, doc: #"{"schema":9}"#)) }
        }
        do { _ = try await SyncEngine(transport: T(), local: local).run(); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? SyncError, .newerSchema) }
        XCTAssertEqual(local.writes, 0)
    }

    func testCorruptRemoteTouchesNothing() async {
        let local = FakeLocal(docWith(daily: ["2026-11-01": 5]))
        let net = FakeNet(); net.version = 3; net.doc = "{{{"
        do { _ = try await SyncEngine(transport: net, local: local).run(); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? SyncError, .corruptRemote) }
        XCTAssertEqual(local.writes, 0); XCTAssertTrue(net.pushes.isEmpty)
    }

    func testNetworkAndAuthFailuresKeepLocalUntouched() async {
        for e in [SyncError.unavailable, .signinRequired] {
            let local = FakeLocal(docWith(daily: ["2026-11-01": 5]))
            let before = local.doc
            let net = FakeNet(); net.fetchError = e
            do { _ = try await SyncEngine(transport: net, local: local).run(); XCTFail("should throw") }
            catch { XCTAssertEqual(error as? SyncError, e) }
            XCTAssertEqual(local.doc, before); XCTAssertEqual(local.writes, 0)
            net.fetchError = nil; net.pushError = e
            do { _ = try await SyncEngine(transport: net, local: local).run(); XCTFail("should throw") }
            catch { XCTAssertEqual(error as? SyncError, e) }
            XCTAssertEqual(local.doc, before)
        }
    }

    func testFailedLocalWriteStopsBeforePush() async {
        let local = FakeLocal(); local.failWrite = true
        let net = FakeNet(); net.doc = docWith(daily: ["2026-11-01": 5]).encode(); net.version = 1
        do { _ = try await SyncEngine(transport: net, local: local).run(); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? SyncError, .unavailable) }
        XCTAssertTrue(net.pushes.isEmpty)
    }

    func testClearMadeWhileSyncingIsNotLost() async throws {
        // a game saves a clear after the GET answered: the next read sees it and the merge includes it
        let local = FakeLocal(docWith(daily: ["2026-11-01": 5]))
        let net = FakeNet(); net.version = 1; net.doc = docWith(daily: ["2026-11-02": 5]).encode()
        local.onRead = { [unowned local] in local.doc.big.dailyHistory["2026-11-10"] = BigDailyRecord(number: 10, timeMs: 3, moves: 1, bigMoves: 0); local.onRead = nil }
        _ = try await SyncEngine(transport: net, local: local).run()
        XCTAssertNotNil(local.doc.big.dailyHistory["2026-11-10"])
        XCTAssertNotNil(try SyncDocument.decode(net.doc!).big.dailyHistory["2026-11-10"])
    }

    func testFileStoreRoundTripKeepsInProgressAndPreferences() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileSyncLocalStore(directory: dir)
        let files = JSONFileStore<WordSave>(name: "word-save", directory: dir)
        var w = WordSave(); w.lastDifficulty = .hard; w.endlessStreak = 3
        files.save(w)
        var d = store.read()
        d.word.completed = 9
        d.word.dailyHistory["2026-11-05"] = WordDailyRecord(number: 5, timeMs: 1, moves: 1, checks: 0)
        XCTAssertTrue(store.write(d))
        let back = files.load()!
        XCTAssertEqual(back.completed, 9); XCTAssertEqual(back.lastDifficulty, .hard); XCTAssertEqual(back.endlessStreak, 3)
        XCTAssertEqual(store.read(), d.normalized())
        // nothing changed -> nothing written (no art / big file appears)
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("art-save.json").path))
    }
}

// MARK: - account wire + ownership + scenarios

final class SyncTestsAccount: XCTestCase {
    private func obj(_ d: Data?) -> [String: Any] { (try! JSONSerialization.jsonObject(with: d!)) as! [String: Any] }

    func testAuthBodyCarriesCodeAsUTF8AndOmitsItWhenNil() {
        let a = obj(AccountWire.authBody(identityToken: "jwt", nonce: "raw", authorizationCode: Data("c123".utf8)))
        XCTAssertEqual(a["identityToken"] as? String, "jwt"); XCTAssertEqual(a["nonce"] as? String, "raw"); XCTAssertEqual(a["authorizationCode"] as? String, "c123")
        XCTAssertEqual(Set(a.keys), ["identityToken", "nonce", "authorizationCode"])
        XCTAssertEqual(Set(obj(AccountWire.authBody(identityToken: "jwt", nonce: "raw", authorizationCode: nil)).keys), ["identityToken", "nonce"])
        XCTAssertEqual(Set(obj(AccountWire.authBody(identityToken: "jwt", nonce: "raw", authorizationCode: Data())).keys), ["identityToken", "nonce"])
    }

    func testAuthAndDeleteReplies() {
        XCTAssertEqual(AccountWire.parseAuth(Data(#"{"token":"t","accountId":"a1"}"#.utf8)), .init(token: "t", accountId: "a1"))
        XCTAssertNil(AccountWire.parseAuth(Data(#"{"token":"","accountId":"a1"}"#.utf8)))
        XCTAssertNil(AccountWire.parseAuth(Data(#"{"error":"x"}"#.utf8)))
        for r in ["revoked", "skipped", "failed"] { XCTAssertEqual(AccountWire.parseDelete(Data(#"{"ok":true,"revoked":"\#(r)"}"#.utf8))?.revoked, AccountWire.Revoked(rawValue: r)) }
        XCTAssertEqual(AccountWire.parseDelete(Data(#"{"ok":true}"#.utf8))?.revoked, .unknown)
        XCTAssertEqual(AccountWire.parseDelete(Data(#"{"ok":true,"revoked":"weird"}"#.utf8))?.revoked, .unknown)
        XCTAssertNil(AccountWire.parseDelete(Data(#"{"ok":false}"#.utf8)))
        XCTAssertNil(AccountWire.parseDelete(Data("nope".utf8)))
    }

    func testDecisionTable() {
        let a = SyncOwnership.hash("A"), b = SyncOwnership.hash("B")
        XCTAssertEqual(AccountSwitchPolicy.decide(owner: nil, newAccount: a, hasUnsynced: false), .proceed)
        XCTAssertEqual(AccountSwitchPolicy.decide(owner: nil, newAccount: a, hasUnsynced: true), .proceed)
        XCTAssertEqual(AccountSwitchPolicy.decide(owner: a, newAccount: a, hasUnsynced: true), .proceed)
        XCTAssertEqual(AccountSwitchPolicy.decide(owner: a, newAccount: a, hasUnsynced: false), .proceed)
        XCTAssertEqual(AccountSwitchPolicy.decide(owner: a, newAccount: b, hasUnsynced: false), .ask(canReplace: true))
        XCTAssertEqual(AccountSwitchPolicy.decide(owner: a, newAccount: b, hasUnsynced: true), .ask(canReplace: false))
    }

    func testDigestChangesStableAndEqualsAfterSync() {
        var g = LCG(s: 11)
        let d = randDoc(&g)
        let base = SyncOwnership.digest(d)
        var more = d; more.big.dailyHistory["2027-01-01"] = BigDailyRecord(number: 9, timeMs: 1, moves: 1, bigMoves: 0)
        XCTAssertNotEqual(SyncOwnership.digest(more), base)             // a clear
        var best = d; best.art.bests["3"] = ArtBest(timeMs: 1, moves: 1)
        XCTAssertNotEqual(SyncOwnership.digest(best), base)             // a best
        var shuffled = d; shuffled.art.history.reverse(); shuffled.word.history.reverse(); shuffled.big.history.shuffle(using: &g)
        XCTAssertEqual(SyncOwnership.digest(shuffled), base)            // ordering does not matter
    }

    @MainActor func testDigestEqualsStoredOneRightAfterSync() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileSyncLocalStore(directory: dir)
        var d = store.read(); d.word.completed = 2; d.word.dailyHistory["2026-11-02"] = WordDailyRecord(number: 2, timeMs: 8, moves: 3, checks: 0); XCTAssertTrue(store.write(d))
        var o = SyncOwnership(); o.signedIn(accountId: "A")
        let r = try await SyncEngine(transport: FakeNet(), local: store).run()
        o.synced(digest: SyncOwnership.digest(r.document))
        XCTAssertFalse(o.hasUnsynced(localDigest: SyncOwnership.digest(store.read())))
        var d2 = store.read(); d2.word.completed = 3; XCTAssertTrue(store.write(d2))   // a new clear after the sync
        XCTAssertTrue(o.hasUnsynced(localDigest: SyncOwnership.digest(store.read())))
    }

    func testOwnershipLifecycle() {
        var o = SyncOwnership()
        o.signedIn(accountId: "A")
        XCTAssertNil(o.owner)                                  // never synced: nothing to protect, first account adopts
        o.synced(digest: "d1"); XCTAssertEqual(o.owner, SyncOwnership.hash("A"))
        o.signedOut(); XCTAssertNil(o.current); XCTAssertNotNil(o.owner); XCTAssertEqual(o.syncedDigest, "d1") // sign-out keeps it
        o.signedIn(accountId: "A"); XCTAssertEqual(o.decision(localDigest: "d2"), .proceed)
        o.signedOut(); o.signedIn(accountId: "B")
        XCTAssertEqual(o.decision(localDigest: "d1"), .ask(canReplace: true))
        XCTAssertEqual(o.decision(localDigest: "d2"), .ask(canReplace: false))
        o.adopt(); XCTAssertEqual(o.owner, SyncOwnership.hash("B")); XCTAssertEqual(o.decision(localDigest: "d2"), .proceed)
        o.deleted(); XCTAssertNil(o.owner); XCTAssertNil(o.syncedDigest)
        o.signedIn(accountId: "C"); XCTAssertEqual(o.decision(localDigest: "x"), .proceed)
    }

    private func bytes(_ dir: URL) -> [String: Data] {
        var m: [String: Data] = [:]
        for f in (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? [] { m[f] = try? Data(contentsOf: dir.appendingPathComponent(f)) }
        return m
    }

    @MainActor func testReplaceRefusedWhenUnsyncedAndTouchesNothing() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileSyncLocalStore(directory: dir)
        var d = store.read(); d.big.dailyHistory["2026-11-01"] = BigDailyRecord(number: 1, timeMs: 5, moves: 1, bigMoves: 0); XCTAssertTrue(store.write(d))
        var o = SyncOwnership(owner: SyncOwnership.hash("A"), current: SyncOwnership.hash("B"), syncedDigest: SyncOwnership.digest(SyncDocument())) // local has a clear A never synced
        let before = bytes(dir)
        XCTAssertEqual(AccountSwitch.replace(&o, store: store), .refusedUnsynced)
        XCTAssertEqual(bytes(dir), before)
        XCTAssertEqual(o.owner, SyncOwnership.hash("A"))
        XCTAssertNil(store.backupDocument())
    }

    @MainActor func testReplaceWritesSafetyCopyFirstAndItRestoresTheSameRecords() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileSyncLocalStore(directory: dir)
        // puzzle in progress + preference live in the same file and must survive
        let words = JSONFileStore<WordSave>(name: "word-save", directory: dir)
        var w = WordSave(); w.lastDifficulty = .hard; words.save(w)
        var d = store.read(); d.big.dailyHistory["2026-11-01"] = BigDailyRecord(number: 1, timeMs: 5, moves: 1, bigMoves: 0); d.word.completed = 3
        d.art.records["p:3"] = ArtKeyRecord(bestTimeMs: 4, bestMoves: 4, clears: 1); XCTAssertTrue(store.write(d))
        let recordsBefore = store.read()
        var o = SyncOwnership(owner: SyncOwnership.hash("A"), current: SyncOwnership.hash("B"), syncedDigest: SyncOwnership.digest(recordsBefore))
        XCTAssertEqual(AccountSwitch.replace(&o, store: store), .ok)
        XCTAssertTrue(store.read().big.dailyHistory.isEmpty); XCTAssertEqual(store.read().word.completed, 0)
        XCTAssertEqual(words.load()?.lastDifficulty, .hard)                  // preferences stay
        XCTAssertEqual(store.backupDocument(), recordsBefore)                // the copy holds exactly the records
        XCTAssertEqual(o.owner, SyncOwnership.hash("B"))
        XCTAssertTrue(store.restoreBackup()); XCTAssertEqual(store.read(), recordsBefore)
    }

    @MainActor func testCancelLeavesFilesByteIdentical() {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileSyncLocalStore(directory: dir)
        var d = store.read(); d.word.completed = 2; XCTAssertTrue(store.write(d))
        var o = SyncOwnership(owner: SyncOwnership.hash("A"), current: SyncOwnership.hash("B"), syncedDigest: "x")
        let before = bytes(dir)
        // cancel = ask, then end the new session: only the ownership's `current` changes
        XCTAssertEqual(o.decision(localDigest: SyncOwnership.digest(store.read())), .ask(canReplace: false))
        o.signedOut()
        XCTAssertEqual(bytes(dir), before)
        XCTAssertEqual(o.owner, SyncOwnership.hash("A"))
    }

    @MainActor func testAThenBThenANeverLosesRecords() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileSyncLocalStore(directory: dir)
        let netA = FakeNet(), netB = FakeNet()
        var o = SyncOwnership()
        var d = store.read(); d.big.dailyHistory["2026-11-01"] = BigDailyRecord(number: 1, timeMs: 5, moves: 1, bigMoves: 0); XCTAssertTrue(store.write(d))
        // A signs in and syncs
        o.signedIn(accountId: "A"); XCTAssertEqual(o.decision(localDigest: SyncOwnership.digest(store.read())), .proceed)
        var r = try await SyncEngine(transport: netA, local: store).run(); o.synced(digest: SyncOwnership.digest(r.document))
        o.signedOut()
        // B signs in: asked; nothing unsynced so replacing is offered; person picks it
        o.signedIn(accountId: "B")
        XCTAssertEqual(o.decision(localDigest: SyncOwnership.digest(store.read())), .ask(canReplace: true))
        XCTAssertEqual(AccountSwitch.replace(&o, store: store), .ok)
        r = try await SyncEngine(transport: netB, local: store).run(); o.synced(digest: SyncOwnership.digest(r.document))
        XCTAssertTrue(store.read().big.dailyHistory.isEmpty)
        // B plays one clear, signs out, A returns: A's server copy restores A's record; B's clear is still on B's server copy
        var d2 = store.read(); d2.word.dailyHistory["2026-11-03"] = WordDailyRecord(number: 3, timeMs: 7, moves: 2, checks: 0); XCTAssertTrue(store.write(d2))
        r = try await SyncEngine(transport: netB, local: store).run(); o.synced(digest: SyncOwnership.digest(r.document))
        o.signedOut(); o.signedIn(accountId: "A")
        XCTAssertEqual(o.decision(localDigest: SyncOwnership.digest(store.read())), .ask(canReplace: true))
        XCTAssertEqual(AccountSwitch.replace(&o, store: store), .ok)
        _ = try await SyncEngine(transport: netA, local: store).run()
        XCTAssertEqual(store.read().big.dailyHistory["2026-11-01"]?.timeMs, 5)
        XCTAssertNil(store.read().word.dailyHistory["2026-11-03"])
        XCTAssertNotNil(try SyncDocument.decode(netB.doc!).word.dailyHistory["2026-11-03"])
        XCTAssertNil(try SyncDocument.decode(netA.doc!).word.dailyHistory["2026-11-03"])
        // and had A chosen "bring in" instead, B's clear would simply be added to A: nothing is lost either way
    }

    @MainActor func testBringInMergesDeviceRecordsIntoNewAccount() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileSyncLocalStore(directory: dir)
        var d = store.read(); d.big.dailyHistory["2026-11-01"] = BigDailyRecord(number: 1, timeMs: 5, moves: 1, bigMoves: 0); XCTAssertTrue(store.write(d))
        var o = SyncOwnership(owner: SyncOwnership.hash("A"), current: SyncOwnership.hash("B"), syncedDigest: "old")
        let netB = FakeNet(); netB.version = 1; netB.doc = docWith(daily: ["2026-11-02": 3]).encode()
        AccountSwitch.bringIn(&o)
        XCTAssertEqual(o.decision(localDigest: "anything"), .proceed)
        _ = try await SyncEngine(transport: netB, local: store).run()
        XCTAssertEqual(try SyncDocument.decode(netB.doc!).big.dailyHistory.keys.sorted(), ["2026-11-01", "2026-11-02"])
    }

    @MainActor func testRestoreOnSecondDeviceAndRetryAfterFailure() async throws {
        let dirA = FileManager.default.temporaryDirectory.appendingPathComponent("syncA-\(UUID().uuidString)")
        let dirB = FileManager.default.temporaryDirectory.appendingPathComponent("syncB-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dirA); try? FileManager.default.removeItem(at: dirB) }
        let a = FileSyncLocalStore(directory: dirA), b = FileSyncLocalStore(directory: dirB)
        var d = a.read(); d.word.completed = 4; d.word.dailyHistory["2026-11-02"] = WordDailyRecord(number: 2, timeMs: 8, moves: 3, checks: 0)
        d.art.records["p:3"] = ArtKeyRecord(bestTimeMs: 9, bestMoves: 9, clears: 2); XCTAssertTrue(a.write(d))
        let net = FakeNet()
        net.pushError = .unavailable
        do { _ = try await SyncEngine(transport: net, local: a).run(); XCTFail() } catch { XCTAssertEqual(error as? SyncError, .unavailable) }
        XCTAssertEqual(a.read().word.completed, 4)          // failure left local alone
        net.pushError = nil
        _ = try await SyncEngine(transport: net, local: a).run()   // retry succeeds
        let r = try await SyncEngine(transport: net, local: b).run() // second device restores
        XCTAssertTrue(r.changedLocal)
        XCTAssertEqual(b.read().word.completed, 4)
        XCTAssertEqual(b.read().art.records["p:3"]?.clears, 2)
        XCTAssertEqual(b.read().word.dailyHistory["2026-11-02"]?.timeMs, 8)
    }
}
