import XCTest
@testable import SlideCore

private struct Golden: Decodable {
    struct H: Decodable { let seed: String; let hash: UInt32 }
    struct F: Decodable { let seed: String; let values: [Double] }
    struct S: Decodable { let seed: String; let out: [Int] }
    struct D: Decodable { let date: String; let n: Int }
    let hash: [H]; let floats: [F]; let shuffles: [S]; let dailyNumbers: [D]
}

final class FoundationTests: XCTestCase {
    private func golden() throws -> Golden {
        let url = Bundle.module.url(forResource: "Golden/rng", withExtension: "json")!
        return try JSONDecoder().decode(Golden.self, from: Data(contentsOf: url))
    }
    func testHashMatchesTypeScript() throws { for h in try golden().hash { XCTAssertEqual(hashSeed(h.seed), h.hash, h.seed) } }
    func testMulberryMatchesTypeScript() throws {
        for f in try golden().floats { let r = rngFromString(f.seed); for v in f.values { XCTAssertEqual(r(), v, accuracy: 0, f.seed) } }
    }
    func testShuffleMatchesTypeScript() throws {
        for s in try golden().shuffles { XCTAssertEqual(shuffled(rngFromString(s.seed), Array(0..<12)), s.out, s.seed) }
    }
    func testDailyNumbers() throws { for d in try golden().dailyNumbers { XCTAssertEqual(DateKeys.dailyNumber(d.date), d.n) } }
    func testJstRollover() {
        // 2026-11-18 14:59:59 UTC is still the 18th in Tokyo; one second later it is the 19th
        let t = DateComponents(calendar: Calendar(identifier: .gregorian), timeZone: TimeZone(secondsFromGMT: 0), year: 2026, month: 11, day: 18, hour: 14, minute: 59, second: 59).date!
        XCTAssertEqual(DateKeys.jstDateKey(t), "2026-11-18")
        XCTAssertEqual(DateKeys.jstDateKey(t.addingTimeInterval(1)), "2026-11-19")
    }
    func testStringsFallbackAndVars() {
        let s = Strings(dicts: ["en": ["a": "Hi {n}", "b": "only en"], "ja": ["a": "やあ {n}"]])
        XCTAssertEqual(s.t("a", .ja, ["n": 3]), "やあ 3")
        XCTAssertEqual(s.t("b", .ja), "only en")
        XCTAssertEqual(s.t("zzz", .en), "zzz")
    }
    func testLangDetect() { XCTAssertEqual(Lang.detect(["ja-JP"]), .ja); XCTAssertEqual(Lang.detect(["it-IT"]), .en); XCTAssertEqual(Lang.detect(["zh-Hans-CN"]), .zh) }
}

final class CatalogTests: XCTestCase {
    func testRealCatalogLoads() throws {
        // #filePath → …/ios/SlideKit/Tests/SlideCoreTests/FoundationTests.swift ; the generated data is in ios/App/App/public
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let url = root.appendingPathComponent("App/App/public/data/artworks.json")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: url.path), "run `npm run ios:data` first")
        let c = try ArtCatalog(url: url)
        XCTAssertGreaterThan(c.artworks.count, 100)
        XCTAssertEqual(c.freeIDs.count, 40)
        XCTAssertTrue(c.freeIDs.allSatisfy { c.artwork($0) != nil })
    }
    func testJSONFileStoreRoundTripAndRecovery() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let s = JSONFileStore<[String: Int]>(name: "t", directory: dir)
        XCTAssertNil(s.load())
        XCTAssertTrue(s.save(["a": 1]))
        XCTAssertTrue(s.save(["a": 2]))
        XCTAssertEqual(s.load(), ["a": 2])
        try Data("{broken".utf8).write(to: dir.appendingPathComponent("t.json")) // corrupt main file → previous good copy
        XCTAssertEqual(s.load(), ["a": 1])
    }
}
