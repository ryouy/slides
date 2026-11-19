import XCTest
@testable import SlideCore

private struct GPiece: Decodable { let id: Int; let kind: String; let w: Int; let h: Int; let r: Int; let c: Int; let label: String; let cells: [[Int]] }
private struct GInit: Decodable { let id: Int; let r: Int; let c: Int }
private struct GMove: Decodable { let id: Int; let dir: String }
private struct GPuzzle: Decodable {
    let id: String; let mode: String; let difficulty: String; let size: Int; let variant: String; let number: Int?; let generatorVersion: String
    let goal: [GPiece]; let initial: [GInit]; let solution: [GMove]
}
private struct GDaily: Decodable { let date: String; let puzzle: GPuzzle }
private struct GReq: Decodable { let variant: String; let size: Int; let difficulty: String }
private struct GEndless: Decodable { let seed: String; let requested: GReq; let puzzle: GPuzzle }
private struct GStreak: Decodable { let days: [String]; let today: String; let current: Int; let max: Int }
private struct GBestIn: Decodable { let timeMs: Int?; let moves: Int? }
private struct GBest: Decodable { let prev: GBestIn; let timeMs: Int; let moves: Int; let out: GBestIn }
private struct BigGolden: Decodable { let generatorVersion: String; let daily: [GDaily]; let endless: [GEndless]; let streaks: [GStreak]; let bests: [GBest] }

private func loadGolden() throws -> BigGolden {
    let url = Bundle.module.url(forResource: "Golden/big", withExtension: "json")!
    return try JSONDecoder().decode(BigGolden.self, from: Data(contentsOf: url))
}

private func assertMatches(_ g: GPuzzle, _ p: BigPuzzle, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(p.id, g.id, label, file: file, line: line)
    XCTAssertEqual(p.difficulty.rawValue, g.difficulty, label + " difficulty", file: file, line: line)
    XCTAssertEqual(p.variant.rawValue, g.variant, label + " variant", file: file, line: line)
    XCTAssertEqual(p.number, g.number, label, file: file, line: line)
    XCTAssertEqual(p.generatorVersion, g.generatorVersion, file: file, line: line)
    XCTAssertEqual(p.goal.count, g.goal.count, label, file: file, line: line)
    for (a, b) in zip(p.goal, g.goal) {
        XCTAssertEqual([a.id, a.w, a.h, a.r, a.c], [b.id, b.w, b.h, b.r, b.c], label + " goal", file: file, line: line)
        XCTAssertEqual(a.kind.rawValue, b.kind, file: file, line: line)
        XCTAssertEqual(a.label, b.label, file: file, line: line)
        XCTAssertEqual(a.cells.map { [$0.r, $0.c] }, b.cells, label + " cells", file: file, line: line)
    }
    XCTAssertEqual(p.initial.map { [$0.id, $0.r, $0.c] }, g.initial.map { [$0.id, $0.r, $0.c] }, label + " initial", file: file, line: line)
    XCTAssertEqual(p.solution.map { "\($0.id)\($0.dir.rawValue)" }, g.solution.map { "\($0.id)\($0.dir)" }, label + " solution", file: file, line: line)
    XCTAssertTrue(validateBigPuzzle(p), label + " validates", file: file, line: line)
}

final class BigTests: XCTestCase {
    func testGeneratorVersion() throws { XCTAssertEqual(bigGeneratorVersion, try loadGolden().generatorVersion) }

    func testDailyMatchesWeb() throws {
        for d in try loadGolden().daily {
            assertMatches(d.puzzle, try generateBigDaily(d.date, timeBudget: false), "daily \(d.date)")
        }
    }

    func testEndlessMatchesWeb() throws {
        for e in try loadGolden().endless {
            let r = e.requested
            let p = try generateBigEndless(size: r.size, difficulty: BigDifficulty(rawValue: r.difficulty)!, seed: e.seed, variant: BigVariant(rawValue: r.variant)!, timeBudget: false)
            assertMatches(e.puzzle, p, "endless \(r.variant) \(r.size) \(r.difficulty) \(e.seed)")
        }
    }

    func testStreaksAndBests() throws {
        let g = try loadGolden()
        for s in g.streaks {
            var h: [String: BigDailyRecord] = [:]
            for d in s.days { h[d] = BigDailyRecord(number: 1, timeMs: 1, moves: 1, bigMoves: 1) }
            XCTAssertEqual(BigStats.currentDailyStreak(h, today: s.today), s.current, "\(s.days)")
            XCTAssertEqual(BigStats.maxDailyStreak(h), s.max, "\(s.days)")
        }
        for b in g.bests {
            let out = BigStats.updateBest(BigBest(timeMs: b.prev.timeMs, moves: b.prev.moves), timeMs: b.timeMs, moves: b.moves)
            XCTAssertEqual(out, BigBest(timeMs: b.out.timeMs, moves: b.out.moves))
        }
        XCTAssertEqual(BigStats.formatTime(65_900), "1:05")
        XCTAssertEqual(BigStats.formatTime(0), "0:00")
    }

    // MARK: rules

    private func puzzle() throws -> BigPuzzle { try generateBigDaily("2026-11-19", timeBudget: false) }

    func testMovesAndIllegalMovesAreNotCounted() throws {
        var s = BigState(puzzle: try puzzle())
        let moves = BigBoard.legalMoves(s.pieces, s.size)
        XCTAssertFalse(moves.isEmpty)
        // find an illegal move: a piece against the wall in some direction
        var illegal: BigMove?
        for p in s.pieces { for d in BigDirection.all where !BigBoard.canMove(s.pieces, s.size, p.id, d) { illegal = BigMove(id: p.id, dir: d) } }
        XCTAssertFalse(s.move(id: illegal!.id, dir: illegal!.dir))
        XCTAssertEqual(s.moves, 0)
        XCTAssertFalse(s.started)
        let m = moves[0]
        XCTAssertTrue(s.move(id: m.id, dir: m.dir))
        XCTAssertEqual(s.moves, 1)
        XCTAssertTrue(s.started)
        XCTAssertEqual(s.bigMoves, BigBoard.piece(s.pieces, m.id)!.kind == .big ? 1 : 0)
        // moving back restores the layout
        XCTAssertTrue(s.move(id: m.id, dir: m.dir.opposite))
        XCTAssertEqual(s.pieces, s.puzzle.initial)
    }

    func testReplayingSolutionClears() throws {
        let p = try puzzle()
        var s = BigState(puzzle: p)
        for (i, m) in p.solution.enumerated() {
            XCTAssertEqual(s.status, .playing)
            XCTAssertTrue(s.move(id: m.id, dir: m.dir), "move \(i)")
        }
        XCTAssertEqual(s.status, .cleared)
        XCTAssertEqual(s.moves, p.solution.count)
        XCTAssertGreaterThanOrEqual(s.bigMoves, 1)
        // a cleared game is frozen
        XCTAssertFalse(s.move(id: p.solution[0].id, dir: p.solution[0].dir))
        s.tick(ms: 500)
        let t = s.elapsedMs
        s.tick(ms: 500)
        XCTAssertEqual(s.elapsedMs, t)
    }

    func testTimerOnlyRunsAfterFirstMove() throws {
        var s = BigState(puzzle: try puzzle())
        s.tick(ms: 1000)
        XCTAssertEqual(s.elapsedMs, 0)
        let m = BigBoard.legalMoves(s.pieces, s.size)[0]
        s.move(id: m.id, dir: m.dir)
        s.tick(ms: 1000)
        XCTAssertEqual(s.elapsedMs, 1000)
    }

    func testBigBlockNeedsMatchingGaps() {
        // 4x4 classic: 2x2 block at (0,0); gaps at (0,2) and (3,3) only: the block cannot move right (needs both (0,2),(1,2))
        let big = makeBigPiece(id: 0, variant: .classic, r: 0, c: 0)
        var pieces = [big]
        var id = 1
        for r in 0..<4 { for c in 0..<4 {
            let inBig = r < 2 && c < 2
            let blank = (r == 0 && c == 2) || (r == 3 && c == 3)
            if inBig || blank { continue }
            pieces.append(BigPiece(id: id, kind: .small, w: 1, h: 1, cells: BigShapes.small, r: r, c: c, label: "\(id)")); id += 1
        } }
        XCTAssertTrue(BigBoard.isValidLayout(pieces, 4))
        XCTAssertEqual(BigBoard.blankCount(pieces, 4), 2)
        XCTAssertFalse(BigBoard.canMove(pieces, 4, 0, .right))
        XCTAssertFalse(BigBoard.canMove(pieces, 4, 0, .up))
        // the tile right of the gap (1,2) can go up
        let t = pieces.first { $0.r == 1 && $0.c == 2 }!
        XCTAssertTrue(BigBoard.canMove(pieces, 4, t.id, .up))
        XCTAssertEqual(BigBoard.legalDirs(pieces, 4, t.id), [.up])
    }

    func testLShapeNotchCounts() {
        // L: cells (0,0),(1,0),(2,0),(2,1). On a 4x4 at (0,0) with its notch cells free it can slide right only if (0,1),(1,1),(2,2) are free
        let l = makeBigPiece(id: 0, variant: .shapes, r: 0, c: 0)
        let blocker = BigPiece(id: 5, kind: .small, w: 1, h: 1, cells: BigShapes.small, r: 1, c: 1, label: "1")
        XCTAssertFalse(BigBoard.canMove([l, blocker], 4, 0, .right))
        XCTAssertTrue(BigBoard.canMove([l], 4, 0, .right))
        XCTAssertTrue(BigBoard.canMove([l], 4, 0, .down))
        XCTAssertFalse(BigBoard.canMove([l], 4, 0, .left))
    }

    func testSolvabilityAndValidationRejectBrokenPuzzles() throws {
        var p = try puzzle()
        XCTAssertTrue(validateBigPuzzle(p))
        p.solution.removeLast()
        XCTAssertFalse(validateBigPuzzle(p))
        var q = try puzzle()
        q.initial = q.goal // already solved
        XCTAssertFalse(validateBigPuzzle(q))
        var r = try puzzle()
        r.initial[0].r = 3 // out of the board / overlapping
        XCTAssertFalse(validateBigPuzzle(r))
    }

    func testEveryVariantAndSizeGeneratesValidPuzzles() throws {
        for v in BigVariant.allCases { for n in bigBoardSizes {
            let p = try generateBigEndless(size: n, difficulty: .easy, seed: "t", variant: v, timeBudget: false)
            XCTAssertTrue(validateBigPuzzle(p), "\(v) \(n)")
            XCTAssertEqual(BigBoard.blankCount(p.initial, n), bigVariantConfig(v).blanks)
        } }
    }

    // MARK: records and save

    func testRecordClearDailyAndEndless() throws {
        var save = BigSave()
        var d = BigState(puzzle: try puzzle())
        for m in d.puzzle.solution { d.move(id: m.id, dir: m.dir) }
        d.elapsedMs = 61_000
        save.recordClear(d, dateKey: "2026-11-19")
        XCTAssertEqual(save.completed, 1)
        XCTAssertEqual(save.dailyHistory["2026-11-19"]?.timeMs, 61_000)
        XCTAssertEqual(save.endlessStreak, 0)
        d.elapsedMs = 30_000
        save.recordClear(d, dateKey: "2026-11-19") // a second clear never overwrites the first
        XCTAssertEqual(save.dailyHistory["2026-11-19"]?.timeMs, 61_000)
        XCTAssertEqual(save.completed, 2)

        let e = try generateBigEndless(size: 5, difficulty: .easy, seed: "x", variant: .duo, timeBudget: false)
        var es = BigState(puzzle: e)
        for m in e.solution { es.move(id: m.id, dir: m.dir) }
        es.elapsedMs = 9000
        save.recordClear(es, dateKey: "2026-11-19")
        XCTAssertEqual(save.endlessStreak, 1)
        XCTAssertEqual(save.maxEndlessStreak, 1)
        XCTAssertEqual(save.bests["duo-5-easy"]?.timeMs, 9000)
        XCTAssertNil(save.bests["5-easy"])
        XCTAssertEqual(BigSave.bestKey(size: 4, difficulty: .normal), "4-normal")
        for i in 0..<250 { var x = es; x.elapsedMs = 1000 + i; save.recordClear(x, dateKey: "2026-11-19") }
        XCTAssertEqual(save.history.count, 200)
    }

    func testSaveRoundTripAndSanitize() throws {
        var save = BigSave()
        let today = "2026-11-19"
        var daily = BigState(puzzle: try generateBigDaily(today, timeBudget: false))
        let m = BigBoard.legalMoves(daily.pieces, daily.size)[0]
        daily.move(id: m.id, dir: m.dir)
        save.inProgress.daily = daily
        save.inProgress.endless = BigState(puzzle: try generateBigEndless(size: 4, difficulty: .easy, seed: "s", timeBudget: false))
        let data = try JSONEncoder().encode(save)
        var back = try JSONDecoder().decode(BigSave.self, from: data)
        XCTAssertEqual(back, save)
        back.sanitize(today: today)
        XCTAssertNotNil(back.inProgress.daily)
        XCTAssertNotNil(back.inProgress.endless)
        back.sanitize(today: "2026-11-20") // stale daily is discarded, endless stays
        XCTAssertNil(back.inProgress.daily)
        XCTAssertNotNil(back.inProgress.endless)
    }

    func testSanitizeDropsOldGeneratorVersionAndBrokenState() throws {
        var save = BigSave()
        var d = BigState(puzzle: try generateBigDaily("2026-11-19", timeBudget: false))
        d.puzzle.generatorVersion = "b0"
        save.inProgress.daily = d
        var e = BigState(puzzle: try generateBigEndless(size: 4, difficulty: .easy, seed: "s", timeBudget: false))
        e.pieces[0].r = 3; e.pieces[0].c = 3 // outside the board
        save.inProgress.endless = e
        save.sanitize(today: "2026-11-19")
        XCTAssertNil(save.inProgress.daily)
        XCTAssertNil(save.inProgress.endless)
    }

    func testLenientDecoding() throws {
        let json = #"{"completed":3,"lastSize":9,"inProgress":{"daily":{"nonsense":true}},"bests":{"4-easy":{"timeMs":1000,"moves":5}}}"#
        let s = try JSONDecoder().decode(BigSave.self, from: Data(json.utf8))
        XCTAssertEqual(s.completed, 3)
        XCTAssertEqual(s.lastSize, 4)
        XCTAssertNil(s.inProgress.daily)
        XCTAssertEqual(s.bests["4-easy"]?.moves, 5)
        let empty = try JSONDecoder().decode(BigSave.self, from: Data("{}".utf8))
        XCTAssertEqual(empty, BigSave())
    }
}
