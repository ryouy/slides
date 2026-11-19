import XCTest
@testable import SlideCore

/// WORD SLIDE: the Swift port must reproduce the TypeScript results exactly (Golden/word.json, written by ios/scripts/export-word.ts).
final class WordTests: XCTestCase {
    typealias J = [String: Any]

    static var root: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent() }

    func catalog() throws -> WordCatalog {
        let url = Self.root.appendingPathComponent("App/App/public/data/word/words.json")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: url.path), "run `npm run ios:data` first")
        return try WordCatalog(url: url)
    }
    func golden() throws -> J {
        let url = Self.root.appendingPathComponent("SlideKit/Tests/SlideCoreTests/Golden/word.json")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: url.path), "run `npm run ios:data` first")
        return try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! J
    }
    func letters(_ a: Any?) -> [String?] { (a as! [Any]).map { $0 is NSNull ? nil : ($0 as! String) } }
    func marks(_ a: Any?) -> [WordMark?] { (a as! [Any]).map { $0 is NSNull ? nil : WordMark(rawValue: $0 as! String) } }
    func ints(_ a: Any?) -> [Int] { (a as! [Any]).map { $0 as! Int } }

    func assertPuzzle(_ p: WordPuzzle?, _ g: J, file: StaticString = #filePath, line: UInt = #line) {
        guard let p else { return XCTFail("generation failed \(g["seed"] ?? "")", file: file, line: line) }
        let w = g["words"] as! J
        XCTAssertEqual(p.words.top, w["top"] as! [String], "top \(g["seed"] ?? "")", file: file, line: line)
        XCTAssertEqual(p.words.bottom, w["bottom"] as! String, file: file, line: line)
        XCTAssertEqual(p.letters, letters(g["letters"]), "letters \(g["seed"] ?? "")", file: file, line: line)
        XCTAssertEqual(p.solution, ints(g["solution"]), file: file, line: line)
        XCTAssertEqual(p.id, g["id"] as? String, file: file, line: line)
        XCTAssertEqual(p.mode.rawValue, g["mode"] as? String, file: file, line: line)
        XCTAssertEqual(p.difficulty.rawValue, g["difficulty"] as? String, file: file, line: line)
        XCTAssertEqual(p.number, g["number"] as? Int, file: file, line: line)
        let clues = g["clues"] as! [J]
        XCTAssertEqual(p.clues.map(\.word), clues.map { $0["word"] as! String }, file: file, line: line)
        XCTAssertEqual(p.clues.map(\.category), clues.map { $0["category"] as! String }, file: file, line: line)
        XCTAssertEqual(p.clues.map(\.definition), clues.map { $0["definition"] as! String }, file: file, line: line)
    }

    func testVersionsMatchWeb() throws {
        let c = try catalog(), g = try golden()
        XCTAssertEqual(c.version, g["wordsVersion"] as? String)
        XCTAssertEqual(WordConst.generatorVersion, g["generatorVersion"] as? String)
    }

    func testDailyPuzzlesMatchWeb() throws {
        let c = try catalog()
        for d in try golden()["daily"] as! [J] {
            let date = d["date"] as! String
            XCTAssertEqual(DateKeys.dailyNumber(date), d["number"] as? Int)
            assertPuzzle(WordGenerator.daily(date, catalog: c), d["puzzle"] as! J)
        }
    }

    func testSeededPuzzlesMatchWeb() throws {
        let c = try catalog()
        for g in try golden()["puzzles"] as! [J] {
            let diff = WordDifficulty(rawValue: g["difficulty"] as! String)!
            let seed = g["seed"] as! String
            assertPuzzle(WordGenerator.generate(seed: seed, id: g["id"] as! String, mode: .endless, difficulty: diff, catalog: c), g)
        }
    }

    func testGeneratedPuzzlesAreValidAndSolvable() throws {
        let c = try catalog()
        for d in WordDifficulty.allCases {
            for i in 0..<12 {
                let p = try XCTUnwrap(WordGenerator.endless(d, seed: "t\(i)", catalog: c))
                XCTAssertTrue(WordGenerator.validate(p))
                var s = WordGameState(puzzle: p)
                XCTAssertFalse(s.found.solved)
                for cell in p.solution { s.apply(.move(cell)) }
                XCTAssertEqual(s.status, .cleared)
                XCTAssertTrue(s.isNoHintClear)
            }
        }
    }

    func testMatcherMatchesWeb() throws {
        for m in try golden()["matcher"] as! [J] {
            let w = m["words"] as! J
            let words = WordSet(top: w["top"] as! [String], bottom: w["bottom"] as! String)
            let r = m["result"] as! J
            let got = WordMatcher.match(letters(m["letters"]), words)
            XCTAssertEqual(got.rows, r["rows"] as! [Bool])
            XCTAssertEqual(got.cards, r["cards"] as! [Bool])
            XCTAssertEqual(got.count, r["count"] as! Int)
            XCTAssertEqual(got.solved, r["solved"] as! Bool)
        }
    }

    func testWordleMatchesWeb() throws {
        let g = try golden()
        for c in g["wordle"] as! [J] {
            XCTAssertEqual(WordWordle.evaluate(letters(c["cells"]), c["target"] as! String), marks(c["marks"]))
        }
        for c in g["checkRows"] as! [J] {
            let r = WordWordle.checkRow(letters(c["letters"]), row: c["row"] as! Int, word: c["word"] as! String)
            XCTAssertEqual(r.cells, letters(c["cells"]))
            XCTAssertEqual(r.marks, marks(c["marks"]))
        }
    }

    func parseAction(_ a: J) -> WordAction {
        switch a["type"] as! String {
        case "move": return .move(a["cell"] as! Int)
        case "dir": return .dir(WordDirection(rawValue: a["dir"] as! String)!)
        case "check": return .check
        case "hint": return .hint(card: a["card"] as! Int, kind: WordHintKind(rawValue: a["kind"] as! String)!)
        case "selRow": return .selRow(a["row"] as! Int)
        case "selCard": return .selCard(a["card"] as! Int)
        case "restart": return .restart
        default: return .tick(a["ms"] as! Int)
        }
    }

    func testReducerTracesMatchWeb() throws {
        let c = try catalog()
        _ = c
        for t in try golden()["reducerTraces"] as! [J] {
            let pj = t["puzzle"] as! J
            let w = pj["words"] as! J
            let clues = (pj["clues"] as! [J]).map { WordEntry(word: $0["word"] as! String, category: $0["category"] as! String, definition: $0["definition"] as! String) }
            let puzzle = WordPuzzle(id: pj["id"] as! String, mode: WordMode(rawValue: pj["mode"] as! String)!, difficulty: WordDifficulty(rawValue: pj["difficulty"] as! String)!,
                                    number: pj["number"] as? Int, words: WordSet(top: w["top"] as! [String], bottom: w["bottom"] as! String), clues: clues,
                                    letters: letters(pj["letters"]), solution: ints(pj["solution"]), generatorVersion: "g2", wordsVersion: "w2")
            var s = WordGameState(puzzle: puzzle)
            let actions = t["actions"] as! [J], steps = t["steps"] as! [J]
            XCTAssertEqual(actions.count, steps.count)
            for (i, a) in actions.enumerated() {
                s.apply(parseAction(a))
                let e = steps[i]
                let ctx = "step \(i) \(a)"
                XCTAssertEqual(WordBoardOps.letters(of: s.board), letters(e["letters"]), ctx)
                XCTAssertEqual(s.moves, e["moves"] as? Int, ctx)
                XCTAssertEqual(s.checks, e["checks"] as? Int, ctx)
                XCTAssertEqual(s.elapsedMs, e["elapsedMs"] as? Int, ctx)
                XCTAssertEqual(s.started, e["started"] as? Bool, ctx)
                XCTAssertEqual(s.status.rawValue, e["status"] as? String, ctx)
                XCTAssertEqual(s.selRow, e["selRow"] as? Int, ctx)
                XCTAssertEqual(s.selCard, e["selCard"] as? Int, ctx)
                if e["marks"] is NSNull { XCTAssertNil(s.marks, ctx) } else { XCTAssertEqual(s.marks ?? [], marks(e["marks"]), ctx) }
                let hu = e["hintUse"] as! J
                XCTAssertEqual([s.hintUse.category, s.hintUse.definition, s.hintUse.first, s.hintUse.extra], [hu["category"], hu["definition"], hu["first"], hu["extra"]].map { $0 as! Int }, ctx)
                let h = e["history"] as! [J]
                XCTAssertEqual(s.history.count, h.count, ctx)
                for (x, y) in zip(s.history, h) {
                    XCTAssertEqual(x.row, y["row"] as? Int, ctx); XCTAssertEqual(x.card, y["card"] as? Int, ctx)
                    XCTAssertEqual(x.found, y["found"] as? Int, ctx)
                    XCTAssertEqual(x.cells, letters(y["cells"]), ctx); XCTAssertEqual(x.marks, marks(y["marks"]), ctx)
                }
                let cards = e["cards"] as! [J]
                for (x, y) in zip(s.cards, cards) {
                    XCTAssertEqual(x.category, y["category"] as? Bool, ctx); XCTAssertEqual(x.definition, y["definition"] as? Bool, ctx)
                    XCTAssertEqual(x.revealed, ints(y["revealed"]), ctx)
                }
            }
        }
    }

    // MARK: rules

    func tinyPuzzle() -> WordPuzzle {
        let words = WordSet(top: ["BIRD", "FISH", "TREE"], bottom: "CAT")
        var l = WordGenerator.goalLetters(words)
        l.swapAt(14, 15) // blank at 14, T at 15
        let clues = [WordEntry(word: "BIRD", category: "Animal", definition: "d"), WordEntry(word: "FISH", category: "Animal", definition: "d"),
                     WordEntry(word: "TREE", category: "Plant", definition: "d"), WordEntry(word: "CAT", category: "Animal", definition: "d")]
        return WordPuzzle(id: "x", mode: .endless, difficulty: .normal, number: nil, words: words, clues: clues, letters: l, solution: [15], generatorVersion: "g2", wordsVersion: "w2")
    }

    func testMovesAndClear() {
        var s = WordGameState(puzzle: tinyPuzzle())
        XCTAssertFalse(s.apply(.move(0)), "a tile far from the blank does not move")
        XCTAssertFalse(s.apply(.move(14)), "the blank itself does not move")
        XCTAssertTrue(s.apply(.dir(.left)), "tile 15 slides left into the blank")
        XCTAssertEqual(s.moves, 1)
        XCTAssertTrue(s.started)
        XCTAssertEqual(s.status, .cleared)
        XCTAssertTrue(s.isNoHintClear)
        let done = s
        s.apply(.move(13)); s.apply(.tick(500)); s.apply(.selRow(0))
        XCTAssertEqual(s, done, "no input after clearing")
        s.apply(.restart)
        XCTAssertEqual(s, WordGameState(puzzle: tinyPuzzle()), "restart works after clearing")
    }

    func testTimerStartsOnFirstAction() {
        var s = WordGameState(puzzle: tinyPuzzle())
        s.apply(.tick(1000))
        XCTAssertEqual(s.elapsedMs, 0)
        s.apply(.dir(.right)) // tile 13 slides right into the blank at 14
        s.apply(.tick(1000))
        XCTAssertEqual(s.elapsedMs, 1000)
        XCTAssertEqual(WordBoardOps.tileForDirection(s.board, .down), 9)
        XCTAssertNil(WordBoardOps.tileForDirection(s.board, .up), "blank in the bottom row: nothing below")
    }

    func testCheckAndHintCounting() {
        var s = WordGameState(puzzle: tinyPuzzle())
        XCTAssertFalse(s.apply(.check), "nothing selected")
        s.apply(.selRow(0))
        XCTAssertFalse(s.canCheck)
        s.apply(.selCard(3))
        XCTAssertEqual(s.selRow, 3, "the 3-letter card goes with row 4")
        XCTAssertTrue(s.canCheck)
        s.apply(.selCard(1))
        XCTAssertNil(s.selRow, "row 4 cannot keep a 4-letter card")
        s.apply(.selRow(3))
        XCTAssertEqual(s.selCard, 3)
        s.apply(.selRow(0))
        XCTAssertEqual(s.selRow, 0)
        XCTAssertNil(s.selCard, "row 1 cannot keep card 4")
        s.apply(.selCard(1))
        XCTAssertTrue(s.canCheck)
        s.apply(.check)
        XCTAssertEqual(s.checks, 1)
        XCTAssertEqual(s.hintsUsed, 1)
        XCTAssertEqual(s.history.count, 1)
        XCTAssertEqual(s.marks?[0], .gray)
        XCTAssertNil(s.marks?[4])
        s.apply(.dir(.right))
        XCTAssertNil(s.marks, "moving clears the colours")
        XCTAssertEqual(s.history.count, 1, "history stays")
        XCTAssertFalse(s.apply(.hint(card: 0, kind: .extra)), "extra needs the first letter")
        XCTAssertTrue(s.apply(.hint(card: 0, kind: .first)))
        XCTAssertFalse(s.apply(.hint(card: 0, kind: .first)), "already revealed: not counted")
        XCTAssertFalse(s.apply(.hint(card: 0, kind: .category)), "normal difficulty starts with the category")
        XCTAssertTrue(s.apply(.hint(card: 0, kind: .definition)))
        XCTAssertTrue(s.apply(.hint(card: 0, kind: .extra)))
        XCTAssertEqual(s.cards[0].revealed, [0, 1])
        XCTAssertEqual(s.hintUse.total, 3)
        XCTAssertEqual(s.hintsUsed, 4)
        s.apply(.dir(.left)); s.apply(.dir(.left)) // back to the solved arrangement
        XCTAssertEqual(s.status, .cleared)
        XCTAssertFalse(s.isNoHintClear)
        XCTAssertTrue(WordHints.isFullyRevealed(WordCardHint(category: true, definition: true, revealed: [0, 1, 2]), word: "CAT"))
    }

    func testDifficultyStartingHints() {
        XCTAssertEqual(WordHints.initial(.easy), WordCardHint(category: true, definition: true, revealed: []))
        XCTAssertEqual(WordHints.initial(.normal), WordCardHint(category: true, definition: false, revealed: []))
        XCTAssertEqual(WordHints.initial(.hard), WordCardHint(category: false, definition: false, revealed: []))
    }

    func testRecordsBestsAndStreaks() throws {
        let g = try golden()["stats"] as! J
        for x in g["streaks"] as! [J] {
            var sv = WordSave()
            for d in ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"] {
                sv.dailyHistory[d] = WordDailyRecord(number: 1, timeMs: 1, moves: 1, checks: 0)
            }
            XCTAssertEqual(sv.currentDailyStreak(today: x["today"] as! String), x["current"] as? Int)
            XCTAssertEqual(sv.maxDailyStreak, g["maxStreak"] as? Int)
        }
        var sv = WordSave()
        let recs = g["recs"] as! [J], after = g["afterRecs"] as! [J]
        for (r, e) in zip(recs, after) {
            sv.recordClear(.init(mode: WordMode(rawValue: r["mode"] as! String)!, difficulty: WordDifficulty(rawValue: r["difficulty"] as! String)!, dateKey: r["dateKey"] as! String,
                                 number: r["number"] as? Int, timeMs: r["timeMs"] as! Int, moves: r["moves"] as! Int, checks: r["checks"] as! Int, hints: r["hints"] as! Int, noHint: (r["noHint"] as? Bool) ?? false))
            XCTAssertEqual(sv.completed, e["completed"] as? Int)
            XCTAssertEqual(sv.noHintClears, e["noHintClears"] as? Int)
            XCTAssertEqual(sv.endlessStreak, e["endlessStreak"] as? Int)
            XCTAssertEqual(sv.maxEndlessStreak, e["maxEndlessStreak"] as? Int)
            XCTAssertEqual(sv.history.count, e["historyLen"] as? Int)
            let bests = e["bests"] as! J
            for d in WordDifficulty.allCases {
                let b = bests[d.rawValue] as! J
                XCTAssertEqual(sv.bests[d]?.timeMs, b["timeMs"] as? Int)
                XCTAssertEqual(sv.bests[d]?.moves, b["moves"] as? Int)
            }
            let dh = e["dailyHistory"] as! J
            XCTAssertEqual(Set(sv.dailyHistory.keys), Set(dh.keys))
            for (k, v) in dh { XCTAssertEqual(sv.dailyHistory[k]?.timeMs, (v as! J)["timeMs"] as? Int, "first daily clear is kept") }
        }
        // history is capped at 200
        for _ in 0..<250 { sv.recordClear(.init(mode: .endless, difficulty: .easy, dateKey: "2026-11-19", timeMs: 1, moves: 1, checks: 0)) }
        XCTAssertEqual(sv.history.count, 200)
    }

    func testSaveValidationAndRoundTrip() throws {
        var sv = WordSave()
        var daily = WordGameState(puzzle: tinyPuzzle())
        daily.puzzle.id = "daily-2026-11-19"
        daily.puzzle.wordsVersion = "w2"
        sv.inProgress.daily = daily
        var endless = WordGameState(puzzle: tinyPuzzle())
        endless.puzzle.wordsVersion = "w2"
        sv.inProgress.endless = endless
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = JSONFileStore<WordSave>(name: "word-save", directory: dir)
        XCTAssertTrue(store.save(sv))
        var loaded = try XCTUnwrap(store.load())
        XCTAssertEqual(loaded, sv)
        loaded.sanitize(wordsVersion: "w2", today: "2026-11-19")
        XCTAssertNotNil(loaded.inProgress.daily)
        XCTAssertNotNil(loaded.inProgress.endless)
        var next = loaded
        next.sanitize(wordsVersion: "w2", today: "2026-11-20")
        XCTAssertNil(next.inProgress.daily, "stale daily is discarded")
        XCTAssertNotNil(next.inProgress.endless)
        var other = loaded
        other.sanitize(wordsVersion: "w3", today: "2026-11-19")
        XCTAssertNil(other.inProgress.daily, "other word list version")
        XCTAssertNil(other.inProgress.endless)
        var broken = loaded
        broken.inProgress.endless?.board[0] = nil // two blanks
        broken.sanitize(wordsVersion: "w2", today: "2026-11-19")
        XCTAssertNil(broken.inProgress.endless, "damaged board")
    }

    func testFormatTime() {
        XCTAssertEqual(wordFormatTime(0), "0:00")
        XCTAssertEqual(wordFormatTime(65_999), "1:05")
        XCTAssertEqual(wordFormatTime(600_000), "10:00")
    }
}
