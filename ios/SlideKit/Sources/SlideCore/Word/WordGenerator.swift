import Foundation

/// Port of src/core/generator.ts. Identical RNG call order, so a seed yields the same puzzle as the web.
public enum WordGenerator {
    struct Setting { var steps: Int; var minMisplaced: Int }
    static func setting(_ d: WordDifficulty) -> Setting {
        switch d {
        case .easy: Setting(steps: 30, minMisplaced: 8)
        case .normal: Setting(steps: 70, minMisplaced: 11)
        case .hard: Setting(steps: 140, minMisplaced: 13)
        }
    }

    public static func pickWords(_ rng: Rng, _ d: WordDifficulty, _ cat: WordCatalog) -> (WordSet, [WordEntry]) {
        let top = Array(shuffled(rng, WordCatalog.pool(cat.four, d)).prefix(3))
        let bottom = pick(rng, WordCatalog.pool(cat.three, d))
        return (WordSet(top: top.map(\.word), bottom: bottom.word), top + [bottom])
    }

    public static func goalLetters(_ w: WordSet) -> [String?] {
        w.top.flatMap { $0.map { String($0) } as [String?] } + (w.bottom.map { String($0) } as [String?]) + [nil]
    }

    static func scramble(_ rng: Rng, _ goal: [String?], steps: Int, minMisplaced: Int) -> (letters: [String?], solution: [Int]) {
        let cells = WordConst.cells
        var arr = goal.indices.map { $0 == cells - 1 ? -1 : $0 }
        var blank = cells - 1
        var prev = -1
        var visited: Set<[Int]> = [arr]
        var path = [blank]
        let limit = steps + 400
        var n = 0
        while n < limit {
            let misplaced = arr.enumerated().filter { i, g in g != -1 && goal[g] != goal[i] }.count + (arr[cells - 1] == -1 ? 0 : 1)
            if n >= steps && misplaced >= minMisplaced { break }
            let options = WordBoardOps.neighbors(blank).filter { $0 != prev }
            let fresh = options.filter { c in
                var a = arr
                a[blank] = a[c]; a[c] = -1
                return !visited.contains(a)
            }
            let next = pick(rng, fresh.isEmpty ? options : fresh)
            arr[blank] = arr[next]; arr[next] = -1
            visited.insert(arr)
            prev = blank
            blank = next
            path.append(blank)
            n += 1
        }
        let letters: [String?] = arr.map { $0 == -1 ? nil : goal[$0] }
        return (letters, Array(path.dropLast().reversed()))
    }

    public static func validate(_ p: WordPuzzle) -> Bool {
        if p.letters.count != WordConst.cells { return false }
        if p.words.top.contains(where: { $0.count != 4 }) || p.words.bottom.count != 3 { return false }
        if Set(p.words.top).count != 3 { return false }
        if p.clues.count != 4 || zip(p.clues, p.words.all).contains(where: { $0.word != $1 }) { return false }
        for c in p.clues {
            // /\bWORD\b/i on the definition
            if let re = try? NSRegularExpression(pattern: "\\b\(c.word)\\b", options: .caseInsensitive),
               re.firstMatch(in: c.definition, range: NSRange(c.definition.startIndex..., in: c.definition)) != nil { return false }
        }
        if p.letters.filter({ $0 == nil }).count != 1 { return false }
        let goal = goalLetters(p.words).map { $0 ?? "" }.sorted()
        if p.letters.map({ $0 ?? "" }).sorted() != goal { return false }
        var board = WordBoardOps.board(from: p.letters)
        if WordMatcher.match(WordBoardOps.letters(of: board), p.words).solved { return false }
        for c in p.solution {
            guard let n = WordBoardOps.moveTile(board, c) else { return false }
            board = n
        }
        return WordMatcher.match(WordBoardOps.letters(of: board), p.words).solved && WordBoardOps.blankIndex(board) == WordConst.cells - 1
    }

    public static func generate(seed: String, id: String, mode: WordMode, difficulty: WordDifficulty, number: Int? = nil, catalog: WordCatalog) -> WordPuzzle? {
        for attempt in 0..<50 {
            let rng = rngFromString("\(WordConst.generatorVersion)|\(seed)|\(attempt)")
            let (words, clues) = pickWords(rng, difficulty, catalog)
            let goal = goalLetters(words)
            let cfg = setting(difficulty)
            let (letters, solution) = scramble(rng, goal, steps: cfg.steps + randInt(rng, 10), minMisplaced: cfg.minMisplaced)
            let p = WordPuzzle(id: id, mode: mode, difficulty: difficulty, number: number, words: words, clues: clues,
                               letters: letters, solution: solution, generatorVersion: WordConst.generatorVersion, wordsVersion: catalog.version)
            if validate(p) && WordMatcher.match(letters, words).count <= 1 { return p }
        }
        return nil
    }

    public static func daily(_ dateKey: String, catalog: WordCatalog) -> WordPuzzle? {
        generate(seed: "daily|\(dateKey)", id: "daily-\(dateKey)", mode: .daily, difficulty: .normal, number: DateKeys.dailyNumber(dateKey), catalog: catalog)
    }

    public static func endless(_ d: WordDifficulty, seed: String = "\(Int(Date().timeIntervalSince1970 * 1000))-\(Double.random(in: 0..<1))", catalog: WordCatalog) -> WordPuzzle? {
        generate(seed: "endless|\(seed)", id: "endless-\(seed)", mode: .endless, difficulty: d, catalog: catalog)
    }
}
