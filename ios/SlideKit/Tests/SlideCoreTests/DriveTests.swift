import XCTest
@testable import SlideCore

// MARK: - golden vectors from the web code (ios/scripts/export-drive.ts)

private func golden() throws -> [String: Any] {
    let url = Bundle.module.url(forResource: "Golden/drive", withExtension: "json")!
    return try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
}
private func data(_ o: Any) -> Data { try! JSONSerialization.data(withJSONObject: o, options: [.fragmentsAllowed]) }
private func doc(_ o: Any) -> DriveDoc { try! JSONDecoder().decode(DriveDoc.self, from: data(o)) }

/// A web ArtSave (the golden shape) as the iOS save: totals in `records`, the split per device in `keyClears` / `counters`.
private func iosSave(_ o: [String: Any]) -> ArtSave {
    var s = ArtSave()
    s.deviceId = o["deviceId"] as! String
    s.completed = o["completed"] as! Int
    s.counters = o["counters"] as! [String: Int]
    s.bests = (o["bests"] as! [String: [String: Int]]).mapValues { ArtBest(timeMs: $0["timeMs"], moves: $0["moves"]) }
    for (k, v) in o["records"] as! [String: [String: Any]] {
        let clears = v["clears"] as! [String: Int]
        s.records[k] = ArtKeyRecord(bestTimeMs: v["bestTimeMs"] as? Int, bestMoves: v["bestMoves"] as? Int, clears: clears.values.reduce(0, +), lastClearedAt: (v["lastClearedAt"] as? Int).map(Double.init))
        s.keyClears[k] = clears
    }
    s.dailyHistory = (try! JSONDecoder().decode([String: DriveDoc.Daily].self, from: data(o["dailyHistory"]!))).mapValues { ArtDailyRecord(number: $0.number, artworkId: $0.artworkId, timeMs: $0.timeMs, moves: $0.moves) }
    s.favorites = (try! JSONDecoder().decode([String: ArtFavorite].self, from: data(o["favorites"] ?? [String: Any]())))
    s.history = (try! JSONDecoder().decode([DriveDoc.History].self, from: data(o["history"]!))).map { ArtPlayRecord(date: $0.date, mode: $0.mode, size: $0.size, artworkId: $0.artworkId, timeMs: $0.timeMs, moves: $0.moves) }
    return s
}

final class DriveTestsGolden: XCTestCase {
    func testMergeMatchesTheWebCode() throws {
        let merges = try golden()["merges"] as! [[String: Any]]
        XCTAssertGreaterThan(merges.count, 50)
        for (i, m) in merges.enumerated() {
            XCTAssertEqual(DriveDoc.merge(doc(m["a"]!), doc(m["b"]!)), doc(m["merged"]!), "merge #\(i)")
        }
    }

    func testNormalizeMatchesTheWebCode() throws {
        let cases = try golden()["normalize"] as! [[String: Any]]
        for (i, c) in cases.enumerated() {
            let raw = c["raw"]!
            if c["normalized"] is NSNull {
                XCTAssertThrowsError(try DriveDoc.normalize(raw), "normalize #\(i)")
            } else {
                XCTAssertEqual(try DriveDoc.normalize(raw), doc(c["normalized"]!), "normalize #\(i)")
            }
        }
        XCTAssertThrowsError(try DriveDoc.normalize(["schema": 99])) { XCTAssertEqual($0 as? DriveDoc.ReadError, .newerSchema) }
        XCTAssertThrowsError(try DriveDoc.parse(Data("not json".utf8))) { XCTAssertEqual($0 as? DriveDoc.ReadError, .unreadable) }
    }

    func testSaveToDocMatchesTheWebCode() throws {
        let cases = try golden()["toDoc"] as! [[String: Any]]
        for (i, c) in cases.enumerated() {
            let save = c["save"] as! [String: Any]
            if (save["completed"] as! Int) != (save["counters"] as! [String: Int]).values.reduce(0, +) { continue } // total above the split: iOS attributes the rest to this device (tested separately)
            XCTAssertEqual(DriveRecords.toDoc(iosSave(save)), doc(c["doc"]!), "toDoc #\(i)")
        }
    }

    func testFromMergedMatchesTheWebCode() throws {
        let cases = try golden()["fromMerged"] as! [[String: Any]]
        for (i, c) in cases.enumerated() {
            let r = DriveRecords.fromMerged(iosSave(c["save"] as! [String: Any]), doc(c["doc"]!).self)
            // the web applies applyDoc(save, doc) = fromMerged(save, mergeDocs(toDoc(save), doc)): same here
            let save = iosSave(c["save"] as! [String: Any])
            let s = DriveRecords.fromMerged(save, DriveDoc.merge(DriveRecords.toDoc(save), doc(c["doc"]!)))
            _ = r
            let want = c["result"] as! [String: Any]
            let wsave = c["save"] as! [String: Any]
            if (wsave["completed"] as! Int) == (wsave["counters"] as! [String: Int]).values.reduce(0, +) { XCTAssertEqual(s.counters, want["counters"] as! [String: Int], "counters #\(i)") } // a total above the split is attributed to this device on iOS
            XCTAssertEqual(s.completed, want["completed"] as! Int, "completed #\(i)")
            let wb = try JSONDecoder().decode([String: DriveDoc.Best].self, from: data(want["bests"]!))
            XCTAssertEqual(s.bests.mapValues { DriveDoc.Best(timeMs: $0.timeMs, moves: $0.moves) }, wb, "bests #\(i)")
            let wr = try JSONDecoder().decode([String: DriveDoc.KeyRecord].self, from: data(want["records"]!))
            var got: [String: DriveDoc.KeyRecord] = [:]
            for (k, v) in s.records { got[k] = .init(bestTimeMs: v.bestTimeMs, bestMoves: v.bestMoves, lastClearedAt: v.lastClearedAt.map { Int($0) }, clears: s.keyClears[k] ?? [:]) }
            XCTAssertEqual(got, wr, "records #\(i)")
            for (k, v) in s.records { XCTAssertEqual(v.clears, (s.keyClears[k] ?? [:]).values.reduce(0, +)) } // UI total = sum of the devices
            XCTAssertEqual(DriveRecords.toDoc(s).dailyHistory, try JSONDecoder().decode([String: DriveDoc.Daily].self, from: data(want["dailyHistory"]!)), "daily #\(i)")
            XCTAssertEqual(DriveRecords.toDoc(s).history, try JSONDecoder().decode([DriveDoc.History].self, from: data(want["history"]!)), "history #\(i)")
            XCTAssertEqual(s.favorites, try JSONDecoder().decode([String: ArtFavorite].self, from: data(want["favorites"]!)), "favorites #\(i)")
        }
    }
}

// MARK: - laws

private struct RNG: RandomNumberGenerator {
    var s: UInt64
    mutating func next() -> UInt64 { s = s &* 6364136223846793005 &+ 1442695040888963407; return s ^ (s >> 29) }
}
private func randomDoc(_ g: inout RNG) -> DriveDoc {
    var d = DriveDoc()
    let devs = ["devA", "devB", "devC"], arts = ["aic-81539", "monet-water-lilies", "z9"]
    for v in devs where Bool.random(using: &g) { d.counters[v] = Int.random(in: 1...9, using: &g) }
    for k in ["3", "4", "5"] where Bool.random(using: &g) { d.bests[k] = .init(timeMs: Bool.random(using: &g) ? Int.random(in: 1...9, using: &g) : nil, moves: Int.random(in: 1...9, using: &g)) }
    for a in arts where Bool.random(using: &g) {
        var c: [String: Int] = [:]; for v in devs where Bool.random(using: &g) { c[v] = Int.random(in: 1...5, using: &g) }
        d.records["\(a):4"] = .init(bestTimeMs: Int.random(in: 1...9, using: &g), bestMoves: nil, lastClearedAt: Int.random(in: 1...9, using: &g), clears: c)
    }
    for i in 0..<8 where Bool.random(using: &g) { d.dailyHistory["2026-11-0\(i + 1)"] = .init(number: i + 1, artworkId: arts[i % 2], timeMs: Int.random(in: 1...4, using: &g), moves: Int.random(in: 1...4, using: &g)) }
    for _ in 0..<Int.random(in: 0...6, using: &g) { d.history.append(.init(date: "2026-11-0\(Int.random(in: 1...5, using: &g))", mode: .endless, size: 4, artworkId: arts.randomElement(using: &g)!, timeMs: Int.random(in: 1...30, using: &g), moves: Int.random(in: 1...30, using: &g))) }
    return DriveDoc.merge(d, DriveDoc()) // canonical form (history sorted / deduplicated)
}

final class DriveTestsLaws: XCTestCase {
    func testMergeLaws() {
        var g = RNG(s: 5)
        for _ in 0..<300 {
            let a = randomDoc(&g), b = randomDoc(&g), c = randomDoc(&g)
            let m = DriveDoc.merge
            XCTAssertEqual(m(a, a), a)
            XCTAssertEqual(m(a, b), m(b, a))
            XCTAssertEqual(m(m(a, b), c), m(a, m(b, c)))
            XCTAssertEqual(m(m(a, b), b), m(a, b))
        }
    }

    func testPerDeviceCountsNeverDoubleCount() {
        var a = DriveDoc(), b = DriveDoc()
        a.counters = ["devA": 5]; b.counters = ["devA": 4, "devB": 2]
        XCTAssertEqual(DriveDoc.merge(a, b).totalClears, 7) // devA's larger count, not 5 + 4
    }

    func testCollationOrderIsTheWebs() {
        XCTAssertLessThan(WebCollation.compare("a|7|x", "a|70|x"), 0)       // '|' sorts before digits (bytes would say the opposite)
        XCTAssertLessThan(WebCollation.compare("a_b", "a-b"), 0)
        XCTAssertLessThan(WebCollation.compare("z9", "za"), 0)
        XCTAssertLessThan(WebCollation.compare("a", "A"), 0)
    }
}

// MARK: - the records of the app on two devices

@MainActor
private final class MemLocal: DriveLocalStore {
    var save: ArtSave
    var fail = false
    init(_ s: ArtSave) { var x = s; x.ensureDriveFields(); save = x }
    func read() -> ArtSave { save }
    func update(_ f: (inout ArtSave) -> Void) -> Bool { if fail { return false }; f(&save); return true }
}

private final class FakeDrive: DriveTransport, @unchecked Sendable {
    var file: Data?
    var fileId = "f1"
    var readError: DriveTransportError?
    var writeError: DriveTransportError?
    var writes = 0
    var creates = 0
    /// What another device writes right after our first write.
    var intruder: (() -> DriveDoc)?
    func read() async throws -> DriveRemote {
        if let e = readError { throw e }
        guard let file else { return .empty }
        do { return .doc(fileId: fileId, doc: try DriveDoc.parse(file)) }
        catch DriveDoc.ReadError.newerSchema { return .unreadable(fileId: fileId, newer: true) }
        catch { return .unreadable(fileId: fileId, newer: false) }
    }
    func write(_ doc: DriveDoc, fileId id: String?) async throws -> String {
        if let e = writeError { throw e }
        writes += 1
        if id == nil { creates += 1 }
        file = doc.jsonData()
        if let i = intruder { intruder = nil; file = DriveDoc.merge(doc, i()).jsonData() }
        return fileId
    }
}

private func clear(_ s: inout ArtSave, _ art: String, size: Int = 3, day: String = "2026-11-02") {
    let p = ArtGenerator.generate(seed: "t\(art)\(size)", id: "e-\(art)", mode: .endless, size: size, artworkId: art, aspect: 1)
    var st = ArtState(puzzle: p); st.elapsedMs = 5000; st.moves = 30; st.status = .cleared
    s.recordClear(st, dateKey: day, now: 1_700_000_000_000)
}

@MainActor
private func go(_ net: FakeDrive, _ local: MemLocal) async -> DriveOutcome { await DriveSyncRunner(transport: net, local: local).run() }

@MainActor
final class DriveTestsRunner: XCTestCase {
    private func device(_ id: String) -> ArtSave { var s = ArtSave(); s.deviceId = id; return s }

    func testFirstSyncCreatesTheFileAndChangesNothingLocally() async throws {
        var s = device("devA"); clear(&s, "monet-water-lilies"); clear(&s, "monet-water-lilies")
        let local = MemLocal(s), net = FakeDrive()
        let before = local.save
        let r = await go(net, local)
        XCTAssertEqual(r, .ok(uploaded: true)); XCTAssertEqual(net.creates, 1)
        XCTAssertEqual(local.save.records, before.records); XCTAssertEqual(local.save.completed, 2)
        let d = try DriveDoc.parse(net.file!)
        XCTAssertEqual(d.counters, ["devA": 2]); XCTAssertEqual(d.records["monet-water-lilies:3"]?.clears, ["devA": 2])
    }

    /// The exact JSON the web writes (schema 2, favourites with "on" and a millisecond time): the app reads it and the stars reach the save;
    /// a star set here goes back to Drive; an un-star made later elsewhere wins.
    func testFavouritesFromTheWebReachTheAppAndBack() async throws {
        let web = #"{"schema":2,"counters":{},"bests":{},"records":{},"dailyHistory":{},"history":[],"favorites":{"monet-water-lilies":{"on":true,"at":1795157607629},"hokusai-great-wave":{"on":true,"at":1795157609000}}}"#
        let net = FakeDrive(); net.file = Data(web.utf8)
        var s = device("devA"); s.favorites["van-gogh-bedroom"] = ArtFavorite(on: true, at: 1795157608000)
        let local = MemLocal(s)
        let r = await go(net, local)
        XCTAssertEqual(r, .ok(uploaded: true))
        XCTAssertEqual(local.save.favorites["monet-water-lilies"], ArtFavorite(on: true, at: 1795157607629))      // from the web
        XCTAssertEqual(local.save.favorites["hokusai-great-wave"], ArtFavorite(on: true, at: 1795157609000))
        XCTAssertEqual(local.save.favorites["van-gogh-bedroom"], ArtFavorite(on: true, at: 1795157608000))        // this device's own
        let up = try DriveDoc.parse(net.file!)
        XCTAssertEqual(up.favorites.count, 3)                                                                     // Drive has all three now
        // the web un-stars the Monet painting later; the app picks that up
        net.file = Data(#"{"schema":2,"favorites":{"monet-water-lilies":{"on":false,"at":1795157700000}}}"#.utf8)
        _ = await go(net, local)
        XCTAssertEqual(local.save.favorites["monet-water-lilies"], ArtFavorite(on: false, at: 1795157700000))
        XCTAssertEqual(local.save.favorites["hokusai-great-wave"]?.on, true)
    }

    func testSecondDeviceRestoresAndNothingIsCountedTwice() async throws {
        var a = device("devA"); clear(&a, "monet-water-lilies"); clear(&a, "monet-water-lilies")
        var b = device("devB"); clear(&b, "van-gogh-bedroom", size: 4)
        let la = MemLocal(a), lb = MemLocal(b), net = FakeDrive()
        _ = await go(net, la)
        _ = await go(net, lb)
        XCTAssertEqual(lb.save.completed, 3)
        XCTAssertEqual(lb.save.records["monet-water-lilies:3"]?.clears, 2)
        XCTAssertEqual(lb.save.records["van-gogh-bedroom:4"]?.clears, 1)
        _ = await go(net, la)
        XCTAssertEqual(la.save.completed, 3)
        for _ in 0..<3 { _ = await go(net, la); _ = await go(net, lb) } // repeated syncs
        XCTAssertEqual(la.save.completed, 3); XCTAssertEqual(lb.save.completed, 3)
        XCTAssertEqual(la.save.records["monet-water-lilies:3"]?.clears, 2)
        // a new clear on B counts once everywhere
        clear(&lb.save, "monet-water-lilies")
        _ = await go(net, lb); _ = await go(net, la)
        XCTAssertEqual(la.save.records["monet-water-lilies:3"]?.clears, 3); XCTAssertEqual(la.save.completed, 4)
        XCTAssertEqual(try DriveDoc.parse(net.file!).counters, ["devA": 2, "devB": 2])
    }

    func testSecondRunWithNothingNewUploadsNothing() async {
        var s = device("devA"); clear(&s, "a")
        let local = MemLocal(s), net = FakeDrive()
        _ = await go(net, local)
        let w = net.writes
        let o1 = await go(net, local); XCTAssertEqual(o1, .ok(uploaded: false))
        XCTAssertEqual(net.writes, w)
    }

    func testConcurrentWriteIsMergedByReReading() async throws {
        var s = device("devA"); clear(&s, "a")
        let local = MemLocal(s), net = FakeDrive()
        var other = DriveDoc(); other.counters = ["devB": 4]; other.records["b:3"] = .init(clears: ["devB": 4])
        net.intruder = { other }   // devB's upload lands right after ours and overwrites it
        let r = await go(net, local)
        XCTAssertEqual(r, .ok(uploaded: true))
        XCTAssertEqual(local.save.completed, 5)                        // devB's clears reached this device
        XCTAssertEqual(try DriveDoc.parse(net.file!).counters, ["devA": 1, "devB": 4]) // and Drive holds both
    }

    func testFailuresLeaveLocalUntouchedAndRetryWorks() async {
        var s = device("devA"); clear(&s, "a")
        let local = MemLocal(s), net = FakeDrive()
        let before = local.save
        net.readError = .unavailable
        let o2 = await go(net, local); XCTAssertEqual(o2, .error(retryable: true))
        net.readError = .auth
        let o3 = await go(net, local); XCTAssertEqual(o3, .needsConsent)
        net.readError = nil; net.writeError = .unavailable
        let o4 = await go(net, local); XCTAssertEqual(o4, .error(retryable: true))
        XCTAssertEqual(local.save.records, before.records); XCTAssertEqual(local.save.completed, before.completed)
        net.writeError = nil
        let o5 = await go(net, local); XCTAssertEqual(o5, .ok(uploaded: true))
    }

    func testNewerSchemaAndDamagedFileAreNeverTouched() async {
        var s = device("devA"); clear(&s, "a")
        for (bytes, want) in [(Data(#"{"schema":99,"counters":{"x":1}}"#.utf8), DriveOutcome.newerVersion), (Data("garbage".utf8), .unreadable), (Data(#"[1,2]"#.utf8), .unreadable)] {
            let local = MemLocal(s), net = FakeDrive(); net.file = bytes
            let before = local.save
            let o6 = await go(net, local); XCTAssertEqual(o6, want)
            XCTAssertEqual(net.file, bytes); XCTAssertEqual(net.writes, 0)
            XCTAssertEqual(local.save, before)
        }
    }

    func testFailedLocalWriteStopsBeforeUpload() async {
        var s = device("devA"); clear(&s, "a")
        let local = MemLocal(s), net = FakeDrive(); local.fail = true
        let o7 = await go(net, local); XCTAssertEqual(o7, .error(retryable: true))
        XCTAssertEqual(net.writes, 0)
    }

    func testOlderSaveGetsDeviceFieldsAndTotalsAreAttributedToThisDevice() async throws {
        var s = ArtSave(); s.completed = 7; s.records["p:3"] = ArtKeyRecord(bestTimeMs: 1, bestMoves: 1, clears: 4, lastClearedAt: 9)
        XCTAssertTrue(s.ensureDriveFields())
        XCTAssertFalse(s.deviceId.isEmpty)
        XCTAssertEqual(s.counters, [s.deviceId: 7]); XCTAssertEqual(s.keyClears["p:3"], [s.deviceId: 4])
        XCTAssertFalse(s.ensureDriveFields())
        // totals raised by the other sync feature (no per-device split) go to this device in the document
        s.completed = 9; s.records["p:3"]!.clears = 6
        let d = DriveRecords.toDoc(s)
        XCTAssertEqual(d.counters, [s.deviceId: 9]); XCTAssertEqual(d.records["p:3"]?.clears, [s.deviceId: 6])
    }

    func testOwnPhotosAreNeverInTheDocument() {
        var s = device("devA"); s.customRecords["custom:x:3"] = ArtKeyRecord(bestTimeMs: 1, bestMoves: 1, clears: 3)
        XCTAssertTrue(DriveRecords.toDoc(s).records.isEmpty)
    }

    func testAccountSwitchSafetyCopyAndReplace() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("drive-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileDriveLocalStore(directory: dir)
        var s = device("devA"); clear(&s, "monet-water-lilies"); s.lastSize = 5
        JSONFileStore<ArtSave>(name: "art-save", directory: dir).save(s)
        var o = SyncOwnership(owner: SyncOwnership.hash("A"), current: SyncOwnership.hash("B"), syncedDigest: "stale")
        let before = try Data(contentsOf: dir.appendingPathComponent("art-save.json"))
        XCTAssertEqual(DriveAccountSwitch.replace(&o, store: store), .refusedUnsynced)   // records that were never synced
        XCTAssertEqual(try Data(contentsOf: dir.appendingPathComponent("art-save.json")), before)
        o.syncedDigest = store.digest()                                                  // now everything is synced to A
        XCTAssertEqual(o.decision(localDigest: store.digest()), .ask(canReplace: true))
        XCTAssertEqual(DriveAccountSwitch.replace(&o, store: store), .ok)
        XCTAssertTrue(store.read().records.isEmpty); XCTAssertEqual(store.read().lastSize, 5); XCTAssertEqual(store.read().deviceId, "devA")
        XCTAssertNotNil(store.backupDocument()?.records["monet-water-lilies:3"])
        XCTAssertTrue(store.restoreBackup())
        XCTAssertEqual(store.read().records["monet-water-lilies:3"]?.clears, 1)
    }
}
