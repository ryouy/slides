import XCTest
@testable import SlideCore

private struct G: Decodable {
    struct Puz: Decodable { let seed: String; let artworkId: String; let size: Int; let aspect: Double; let cols: Int; let rows: Int; let initial: [Int?]; let solution: [Int] }
    struct Day: Decodable { let date: String; let artworkId: String; let aspect: Double; let number: Int; let cols: Int; let rows: Int; let initial: [Int?]; let solution: [Int] }
    struct P0: Decodable { let id: String; let mode: String; let size: Int; let number: Int?; let initial: [Int?]; let solution: [Int] }
    struct Played: Decodable { let board: [Int?]; let moves: Int; let blankPath: [Int] }
    struct Sh: Decodable { let artworkId: String; let aspect: Double; let puzzle: P0; let played: Played; let clicks: [Int]; let newInitial: [Int?]; let newSolution: [Int]; let newId: String; let newMode: String; let newNumber: Int? }
    struct Grid: Decodable { let aspect: Double; let levels: [Dims] }
    struct Filt: Decodable { let q: String; let ids: [String] }
    struct Sort: Decodable { let sortBy: String; let seed: UInt32; let ids: [String] }
    struct Grp: Decodable { let key: String; let ids: [String] }
    struct Case: Decodable { let groupBy: String; let sortBy: String; let premium: Bool; let q: String; let seed: UInt32; let groups: [Grp] }
    struct Pick: Decodable { let date: String; let ids: [String] }
    struct Lvl: Decodable { let level: Int; let freeLocked: Bool; let premiumLocked: Bool }
    struct Aw: Decodable { let id: String; let freeLocked: Bool; let premiumLocked: Bool }
    struct Rules: Decodable { let freeMaxLevel: Int; let levels: [Lvl]; let artworks: [Aw] }
    let puzzles: [Puz]; let daily: [Day]; let shuffles: [Sh]; let grids: [Grid]; let filters: [Filt]; let sorts: [Sort]; let groups: [Case]; let picks: [Pick]; let rules: Rules
    let free: [String]; let artworkCount: Int
}

private func golden() throws -> G {
    let url = Bundle.module.url(forResource: "Golden/art", withExtension: "json")!
    return try JSONDecoder().decode(G.self, from: Data(contentsOf: url))
}
private func catalog() throws -> ArtCatalog {
    let root = URL(fileURLWithPath: #filePath).resolvingSymlinksInPath().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let url = root.appendingPathComponent("App/App/public/data/artworks.json")
    try XCTSkipUnless(FileManager.default.fileExists(atPath: url.path), "run `npm run ios:data` first")
    return try ArtCatalog(url: url)
}

final class ArtTests: XCTestCase {
    // MARK: parity with the TypeScript generator

    func testGridsMatchTypeScript() throws {
        for g in try golden().grids {
            for (i, l) in artLevels.enumerated() { XCTAssertEqual(ArtGrid.gridFor(aspect: g.aspect, level: l), g.levels[i], "aspect \(g.aspect) level \(l)") }
        }
    }

    func testPuzzlesMatchTypeScript() throws {
        let all = try golden().puzzles
        XCTAssertGreaterThan(all.count, 50)
        for p in all {
            let out = ArtGenerator.generate(seed: p.seed, id: "x", mode: .endless, size: p.size, artworkId: p.artworkId, aspect: p.aspect)
            XCTAssertEqual(out.cols, p.cols); XCTAssertEqual(out.rows, p.rows)
            XCTAssertEqual(out.initial, p.initial, "\(p.artworkId) \(p.size) \(p.seed)")
            XCTAssertEqual(out.solution, p.solution, "\(p.artworkId) \(p.size) \(p.seed)")
            XCTAssertTrue(ArtGenerator.validate(out))
        }
    }

    func testDailyMatchesTypeScriptIncludingPool() throws {
        let c = try catalog()
        for d in try golden().daily {
            XCTAssertEqual(ArtDaily.artworkID(d.date, pools: c.dailyPools), d.artworkId, d.date)
            let p = ArtGenerator.generateDaily(dateKey: d.date, artworkId: d.artworkId, aspect: d.aspect)
            XCTAssertEqual(p.number, d.number); XCTAssertEqual(p.initial, d.initial, d.date); XCTAssertEqual(p.solution, d.solution, d.date)
            XCTAssertEqual(p.cols, d.cols); XCTAssertEqual(p.id, "artdaily-\(d.date)"); XCTAssertEqual(p.size, 4)
            XCTAssertTrue(c.isFree(d.artworkId), "the iOS daily must be a bundled free painting")
        }
    }

    func testDailyGoldenFromFoundationVectors() throws {
        // same dates as rng.json "iosDaily" (frozen pool, so already-played days never change)
        let c = try catalog()
        XCTAssertEqual(ArtDaily.artworkID("2026-11-18", pools: c.dailyPools), "hiroshige-arai")
        XCTAssertEqual(ArtDaily.artworkID("2026-11-30", pools: c.dailyPools), "constable-stoke-by-nayland")        // last day of the frozen 40-painting pool
        XCTAssertEqual(ArtDaily.artworkID("2026-12-01", pools: c.dailyPools), "david-madame-de-pastoret-and-her-son") // first day of the 75-painting pool
        XCTAssertEqual(ArtDaily.artworkID("2026-12-25", pools: c.dailyPools), "hiroshige-mishima-morning-mist")
        XCTAssertEqual(ArtDaily.artworkID("2027-01-01", pools: c.dailyPools), "aic-110881")
    }

    func testDailyCoversWholePoolBeforeRepeating() throws {
        let c = try catalog()
        XCTAssertEqual(c.dailyPools.count, 2)
        XCTAssertEqual(c.dailyPools[0].ids.count, 40)
        let n = c.dailyPools[1].ids.count   // the 75-painting pool: all of it once before any repeat
        XCTAssertEqual(n, 75)
        var seen = Set<String>()
        var day = c.dailyPools[1].from
        for _ in 0..<n { seen.insert(ArtDaily.artworkID(day, pools: c.dailyPools)!); day = DateKeys.addDays(day, 1) }
        XCTAssertEqual(seen.count, n)
    }

    func testReshuffleMatchesTypeScript() throws {
        for s in try golden().shuffles {
            let p = ArtPuzzle(id: s.puzzle.id, mode: s.puzzle.mode == "daily" ? .daily : .endless, size: s.puzzle.size,
                              cols: ArtGrid.gridFor(aspect: s.aspect, level: s.puzzle.size).cols, rows: ArtGrid.gridFor(aspect: s.aspect, level: s.puzzle.size).rows,
                              artworkId: s.artworkId, number: s.puzzle.number, initial: s.puzzle.initial, solution: s.puzzle.solution)
            var st = ArtState(puzzle: p)
            st.board = s.played.board; st.moves = s.played.moves; st.blankPath = s.played.blankPath
            let plan = ArtGenerator.planReshuffle(st, seed: "seed\(try XCTUnwrap(try golden().shuffles.firstIndex(where: { $0.artworkId == s.artworkId })))")
            XCTAssertEqual(plan.clicks, s.clicks, s.artworkId)
            XCTAssertEqual(plan.puzzle.initial, s.newInitial)
            XCTAssertEqual(plan.puzzle.solution, s.newSolution)
            XCTAssertEqual(plan.puzzle.id, s.newId)
            XCTAssertEqual(plan.puzzle.mode.rawValue, s.newMode)
            XCTAssertEqual(plan.puzzle.number, s.newNumber)
            XCTAssertTrue(ArtGenerator.validate(plan.puzzle), "the shuffled puzzle must stay solvable by its own solution")
        }
    }

    // MARK: rules

    private func puzzle3() -> ArtPuzzle { ArtGenerator.generate(seed: "rules", id: "r", mode: .endless, size: 3, artworkId: "a", aspect: 1) }

    func testSolvabilityAndLevels() {
        for level in artLevels {
            for aspect in [0.6, 1.0, 1.7] {
                let p = ArtGenerator.generate(seed: "s\(level)", id: "r", mode: .endless, size: level, artworkId: "a", aspect: aspect)
                XCTAssertTrue(ArtGenerator.validate(p)); XCTAssertFalse(Board.isSolved(p.initial))
                XCTAssertTrue(Board.isValid(p.initial, p.dims))
            }
        }
        let counts = artLevels.map { ArtGrid.gridFor(aspect: 1.3, level: $0).count }
        XCTAssertEqual(counts, counts.sorted()); XCTAssertEqual(Set(counts).count, counts.count)
    }

    func testSlideRulesAndLineSlide() {
        let d = Dims(cols: 3, rows: 3)
        var b = Board.solved(d)
        XCTAssertTrue(Board.isSolved(b))
        XCTAssertNil(Board.moveTile(b, d, 0)) // not next to the blank
        XCTAssertNil(Board.moveTile(b, d, 8)) // the blank itself
        b = Board.moveTile(b, d, 5)!
        XCTAssertEqual(Board.blankIndex(b), 5)
        XCTAssertFalse(Board.isSolved(b))
        XCTAssertEqual(Board.lineSlideCells(Board.solved(d), d, 2), [5, 2])
        XCTAssertEqual(Board.lineSlideCells(Board.solved(d), d, 6), [7, 6])
        XCTAssertEqual(Board.lineSlideCells(Board.solved(d), d, 0), [])
        XCTAssertEqual(Board.tileForDirection(Board.solved(d), d, .down), 5)
        XCTAssertEqual(Board.tileForDirection(Board.solved(d), d, .right), 7)
        XCTAssertNil(Board.tileForDirection(Board.solved(d), d, .up))
        XCTAssertEqual(Board.slideDirection(Board.solved(d), d, 2), .down)
        XCTAssertEqual(Board.slideDirection(Board.solved(d), d, 6), .right)
        XCTAssertNil(Board.slideDirection(Board.solved(d), d, 0))
    }

    func testPlayingTheSolutionClearsAndCountsMoves() {
        var st = ArtState(puzzle: puzzle3())
        XCTAssertFalse(st.started)
        for (i, c) in st.puzzle.solution.enumerated() {
            XCTAssertFalse(st.cleared)
            XCTAssertTrue(st.move(c)); XCTAssertEqual(st.moves, i + 1)
        }
        XCTAssertTrue(st.cleared); XCTAssertTrue(Board.isSolved(st.board)); XCTAssertTrue(st.started)
        XCTAssertFalse(st.move(0)); XCTAssertEqual(st.moves, st.puzzle.solution.count) // no input after clearing
        st.tick(ms: 500); XCTAssertEqual(st.elapsedMs, 0)
    }

    func testLineMoveCountsEachTileAndKeepsBoardValid() {
        let p = puzzle3()
        var st = ArtState(puzzle: p)
        let blank = Board.blankIndex(st.board)
        let far = (0..<9).first { $0 != blank && ($0 / 3 == blank / 3 || $0 % 3 == blank % 3) && !Board.neighbors(blank, p.dims).contains($0) }
        if let far {
            let cells = st.lineMove(far)
            XCTAssertEqual(cells.count, 2); XCTAssertEqual(st.moves, 2); XCTAssertEqual(Board.blankIndex(st.board), far)
            XCTAssertTrue(Board.isValid(st.board, p.dims))
        }
        var s2 = ArtState(puzzle: p)
        XCTAssertTrue(s2.lineMove(blank).isEmpty); XCTAssertEqual(s2.moves, 0)
        XCTAssertFalse(s2.move(direction: .up) && s2.moves != 1)
    }

    func testTimerStartsAtFirstMoveOnly() {
        var st = ArtState(puzzle: puzzle3())
        st.tick(ms: 1000); XCTAssertEqual(st.elapsedMs, 0)
        _ = st.move(st.puzzle.solution[0]); st.tick(ms: 1000); XCTAssertEqual(st.elapsedMs, 1000)
    }

    func testSlideStepAndRestart() {
        var st = ArtState(puzzle: puzzle3())
        let c = st.puzzle.solution[0]
        XCTAssertTrue(st.slideStep(c)); XCTAssertEqual(st.moves, 0); XCTAssertFalse(st.started)
        st.restart(); XCTAssertEqual(st.board, st.puzzle.initial)
    }

    func testSavedStateValidation() throws {
        var st = ArtState(puzzle: puzzle3())
        XCTAssertTrue(st.isValid)
        let data = try JSONEncoder().encode(st)
        XCTAssertEqual(try JSONDecoder().decode(ArtState.self, from: data), st)
        st.board[0] = 99; XCTAssertFalse(st.isValid)
        var st2 = ArtState(puzzle: puzzle3()); st2.puzzle.size = 9; XCTAssertFalse(st2.isValid)
        // damaged in-progress state is dropped, the rest of the save survives
        var save = ArtSave(); save.completed = 4; save.inProgressFree = ArtState(puzzle: puzzle3())
        var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(save)) as! [String: Any]
        var f = json["inProgressFree"] as! [String: Any]; f["board"] = [1, 2, 3]; json["inProgressFree"] = f
        let back = try JSONDecoder().decode(ArtSave.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertNil(back.inProgressFree); XCTAssertEqual(back.completed, 4)
        // garbage and newer versions never crash
        XCTAssertEqual(try JSONDecoder().decode(ArtSave.self, from: Data("{\"completed\":\"x\",\"gallery\":5}".utf8)).completed, 0)
        XCTAssertEqual(try JSONDecoder().decode(ArtSave.self, from: Data("{\"version\":99,\"completed\":7}".utf8)).completed, 0)
    }

    // MARK: records, streaks

    func testRecordsBestsAndDailyHistory() {
        var save = ArtSave()
        var st = ArtState(puzzle: ArtGenerator.generateDaily(dateKey: "2026-11-19", artworkId: "monet-water-lilies", aspect: 1.2))
        st.elapsedMs = 90_000; st.moves = 50
        let o1 = save.recordClear(st, dateKey: "2026-11-19", now: 1)
        XCTAssertTrue(o1.firstClear); XCTAssertEqual(save.completed, 1)
        XCTAssertEqual(save.dailyHistory["2026-11-19"]?.artworkId, "monet-water-lilies")
        XCTAssertNil(save.bests["4"]) // daily clears do not touch free-play bests
        st.elapsedMs = 120_000; st.moves = 40
        let o2 = save.recordClear(st, dateKey: "2026-11-19", now: 2)
        XCTAssertFalse(o2.newBestTime); XCTAssertTrue(o2.newBestMoves)
        let r = save.records["monet-water-lilies:4"]!
        XCTAssertEqual(r.bestTimeMs, 90_000); XCTAssertEqual(r.bestMoves, 40); XCTAssertEqual(r.clears, 2)
        XCTAssertEqual(save.dailyHistory["2026-11-19"]?.timeMs, 90_000) // the day's first clear stands

        let free = ArtGenerator.generateFree(artworkId: "x", size: 5, aspect: 1)
        var fs = ArtState(puzzle: free); fs.elapsedMs = 5000; fs.moves = 9
        save.recordClear(fs, dateKey: "2026-11-19")
        XCTAssertEqual(save.bests["5"]?.timeMs, 5000); XCTAssertEqual(save.history.count, 3)
    }

    func testOwnPhotosKeepSeparateRecords() {
        var save = ArtSave()
        var st = ArtState(puzzle: ArtGenerator.generateFree(artworkId: "custom:abc", size: 3, aspect: 1))
        st.elapsedMs = 1234; st.moves = 7
        save.recordClear(st, dateKey: "2026-11-19")
        XCTAssertEqual(save.completed, 0); XCTAssertTrue(save.records.isEmpty); XCTAssertTrue(save.history.isEmpty)
        XCTAssertEqual(save.customRecords["custom:abc:3"]?.bestTimeMs, 1234)
    }

    func testStreaks() {
        func h(_ days: [String]) -> [String: ArtDailyRecord] { Dictionary(uniqueKeysWithValues: days.map { ($0, ArtDailyRecord(number: 1, artworkId: "a", timeMs: 1, moves: 1)) }) }
        XCTAssertEqual(ArtStats.currentDailyStreak(h([]), today: "2026-11-19"), 0)
        XCTAssertEqual(ArtStats.currentDailyStreak(h(["2026-11-17", "2026-11-18", "2026-11-19"]), today: "2026-11-19"), 3)
        XCTAssertEqual(ArtStats.currentDailyStreak(h(["2026-11-17", "2026-11-18"]), today: "2026-11-19"), 2) // today not done yet: yesterday keeps it
        XCTAssertEqual(ArtStats.currentDailyStreak(h(["2026-11-10"]), today: "2026-11-19"), 0)
        XCTAssertEqual(ArtStats.maxDailyStreak(h(["2026-11-01", "2026-11-02", "2026-11-05", "2026-11-06", "2026-11-07"])), 3)
        XCTAssertEqual(ArtStats.maxDailyStreak(h(["2026-12-31", "2027-01-01"])), 2) // across a year boundary
        XCTAssertEqual(ArtStats.formatTime(65_400), "1:05"); XCTAssertEqual(ArtStats.formatTime(3_725_000), "62:05")
    }

    func testCustomPhotoLimits() {
        XCTAssertEqual(CustomPhotoRules.limitProblem(count: 20, usedBytes: 0, extraBytes: 1), .limit)
        XCTAssertEqual(CustomPhotoRules.limitProblem(count: 3, usedBytes: CustomPhotoRules.maxTotalBytes - 10, extraBytes: 11), .quota)
        XCTAssertNil(CustomPhotoRules.limitProblem(count: 3, usedBytes: 100, extraBytes: 100))
        XCTAssertEqual(CustomPhotoRules.fitWithin(4000, 3000, max: 1600).width, 1600)
        XCTAssertEqual(CustomPhotoRules.fitWithin(4000, 3000, max: 1600).height, 1200)
        XCTAssertEqual(CustomPhotoRules.fitWithin(800, 600, max: 1600).width, 800) // never scaled up
        XCTAssertEqual(CustomPhotoRules.photoID(CustomPhotoRules.artworkID("x1")), "x1")
    }

    // MARK: gallery and locks

    func testGalleryFilterSortGroupMatchTypeScript() throws {
        let c = try catalog(); let g = try golden()
        XCTAssertEqual(g.artworkCount, c.artworks.count, "regenerate art.json: `npx vite-node ios/scripts/export-art.ts`")
        for f in g.filters { XCTAssertEqual(ArtGallery.filter(c.artworks, query: f.q).map(\.id), f.ids, "query '\(f.q)'") }
        for s in g.sorts { XCTAssertEqual(ArtGallery.sort(c.artworks, by: SortBy(rawValue: s.sortBy)!, randomSeed: s.seed).map(\.id), s.ids, s.sortBy) }
        for k in g.groups {
            let out = ArtGallery.group(ArtGallery.filter(c.artworks, query: k.q), by: GroupBy(rawValue: k.groupBy)!, sortBy: SortBy(rawValue: k.sortBy)!, randomSeed: k.seed,
                                       isLocked: { ArtRules.isArtworkLocked($0.id, premium: k.premium, catalog: c) })
            XCTAssertEqual(out.map(\.key), k.groups.map(\.key), "\(k.groupBy) \(k.sortBy) premium=\(k.premium) q='\(k.q)'")
            XCTAssertEqual(out.map { $0.items.map(\.id) }, k.groups.map(\.ids), "\(k.groupBy) \(k.sortBy) premium=\(k.premium) q='\(k.q)'")
        }
        for p in g.picks { XCTAssertEqual(ArtGallery.homePicks(c.artworks.filter { c.isFree($0.id) }, dateKey: p.date).map(\.id), p.ids) }
    }

    func testLockedPaintingsAreLastInEveryGroup() throws {
        let c = try catalog()
        for by in GroupBy.allCases {
            for gr in ArtGallery.group(c.artworks, by: by, sortBy: .artist, isLocked: { !c.isFree($0.id) }) {
                let flags = gr.items.map { !c.isFree($0.id) }
                XCTAssertEqual(flags, flags.sorted { !$0 && $1 }, "\(by) \(gr.key)")
            }
        }
        XCTAssertEqual(ArtGallery.group(c.artworks, by: .theme, sortBy: .artist).map(\.key).prefix(2), ["Landscape", "Sea & Water"])
    }

    func testLockRulesMatchTypeScript() throws {
        let c = try catalog(); let r = try golden().rules
        XCTAssertEqual(ArtRules.freeMaxLevel, r.freeMaxLevel)
        for l in r.levels {
            XCTAssertEqual(ArtRules.isLevelLocked(l.level, premium: false), l.freeLocked); XCTAssertEqual(ArtRules.isLevelLocked(l.level, premium: true), l.premiumLocked)
        }
        for a in r.artworks {
            XCTAssertEqual(ArtRules.isArtworkLocked(a.id, premium: false, catalog: c), a.freeLocked, a.id)
            XCTAssertEqual(ArtRules.isArtworkLocked(a.id, premium: true, catalog: c), a.premiumLocked, a.id)
        }
        XCTAssertEqual(try golden().free.count, c.freeIDs.count)
    }

    func testNextPlayableSkipsLockedAndWraps() throws {
        let c = try catalog()
        let freeList = c.artworks.filter { c.isFree($0.id) }
        let last = freeList.last!
        XCTAssertEqual(ArtGallery.nextPlayable(after: last.id, in: c.artworks, premium: false, catalog: c)?.id, freeList.first!.id)
        XCTAssertEqual(ArtGallery.nextPlayable(after: freeList[0].id, in: c.artworks, premium: false, catalog: c)?.id, freeList[1].id)
    }

    func testRandomRankIsStable() { XCTAssertEqual(ArtGallery.randomRank("abc", seed: 7), ArtGallery.randomRank("abc", seed: 7)) }
}
