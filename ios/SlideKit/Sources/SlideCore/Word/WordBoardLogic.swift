import Foundation

/// Port of src/core/board.ts, matcher.ts, wordle.ts, hints.ts.
public enum WordBoardOps {
    public static func row(_ i: Int) -> Int { i / WordConst.size }
    public static func col(_ i: Int) -> Int { i % WordConst.size }

    public static func board(from letters: [String?]) -> WordBoard {
        letters.enumerated().map { i, l in l.map { WordTile(id: i, letter: $0) } }
    }
    public static func letters(of b: WordBoard) -> [String?] { b.map { $0?.letter } }
    public static func blankIndex(_ b: WordBoard) -> Int { b.firstIndex(where: { $0 == nil }) ?? -1 }

    /// Orthogonal neighbours (no diagonals, no wrap). Same order as the web: up, down, left, right.
    public static func neighbors(_ i: Int) -> [Int] {
        let r = row(i), c = col(i), s = WordConst.size
        var out: [Int] = []
        if r > 0 { out.append(i - s) }
        if r < s - 1 { out.append(i + s) }
        if c > 0 { out.append(i - 1) }
        if c < s - 1 { out.append(i + 1) }
        return out
    }

    public static func canMove(_ b: WordBoard, _ idx: Int) -> Bool {
        guard idx >= 0, idx < WordConst.cells, b[idx] != nil else { return false }
        return neighbors(idx).contains(blankIndex(b))
    }

    /// Slide the tile at `idx` into the blank; nil if illegal.
    public static func moveTile(_ b: WordBoard, _ idx: Int) -> WordBoard? {
        guard canMove(b, idx) else { return nil }
        let blank = blankIndex(b)
        var n = b
        n[blank] = b[idx]
        n[idx] = nil
        return n
    }

    /// Cell of the tile that travels in `dir` (the direction the tile moves).
    public static func tileForDirection(_ b: WordBoard, _ dir: WordDirection) -> Int? {
        let blank = blankIndex(b)
        guard blank >= 0 else { return nil }
        let r = row(blank), c = col(blank), s = WordConst.size
        switch dir {
        case .left: return c < s - 1 ? blank + 1 : nil
        case .right: return c > 0 ? blank - 1 : nil
        case .up: return r < s - 1 ? blank + s : nil
        case .down: return r > 0 ? blank - s : nil
        }
    }

    public static func isValidBoard(_ b: WordBoard) -> Bool {
        b.count == WordConst.cells && b.filter { $0 == nil }.count == 1 && b.allSatisfy { $0 == nil || $0!.letter.count == 1 }
    }
}

public struct WordFound: Equatable, Sendable {
    public var rows: [Bool]
    public var cards: [Bool]
    public var count: Int
    public var solved: Bool
}

public enum WordMatcher {
    /// Completed words currently on the board (current state, not cumulative).
    public static func match(_ letters: [String?], _ words: WordSet) -> WordFound {
        var rows = [false, false, false, false]
        var cards = [false, false, false, false]
        var used = Set<Int>()
        for r in 0..<3 {
            let cells = Array(letters[(r * 4)..<(r * 4 + 4)])
            if cells.contains(where: { $0 == nil }) { continue }
            let str = cells.map { $0! }.joined()
            if let wi = words.top.indices.first(where: { words.top[$0] == str && !used.contains($0) }) {
                used.insert(wi); cards[wi] = true; rows[r] = true
            }
        }
        let b = Array(letters[12..<15])
        if !b.contains(where: { $0 == nil }), b.map({ $0! }).joined() == words.bottom { rows[3] = true; cards[3] = true }
        let count = rows.filter { $0 }.count
        return WordFound(rows: rows, cards: cards, count: count, solved: count == 4 && letters[15] == nil)
    }
}

public enum WordWordle {
    /// Wordle-style evaluation of one row against one target word. Blanks yield nil.
    public static func evaluate(_ cells: [String?], _ target: String) -> [WordMark?] {
        let t = target.map { String($0) }
        var marks = [WordMark?](repeating: nil, count: cells.count)
        var remaining: [String: Int] = [:]
        for (i, ch) in cells.enumerated() { if let ch, i < t.count, t[i] == ch { marks[i] = .green } }
        for i in t.indices where marks[i] != .green { remaining[t[i], default: 0] += 1 }
        for (i, ch) in cells.enumerated() {
            guard let ch, marks[i] != .green else { continue }
            if remaining[ch, default: 0] > 0 { marks[i] = .yellow; remaining[ch]! -= 1 } else { marks[i] = .gray }
        }
        return marks
    }

    /// CHECK: one board row against one word; row 3 compares only its left 3 cells.
    public static func checkRow(_ letters: [String?], row: Int, word: String) -> (cells: [String?], marks: [WordMark?]) {
        let width = row == 3 ? 3 : 4
        let cells = Array(letters[(row * 4)..<(row * 4 + width)])
        return (cells, evaluate(cells, word))
    }
}

public enum WordHintKind: String, Codable, CaseIterable, Sendable { case category, definition, first, extra }

public struct WordCardHint: Codable, Equatable, Sendable {
    public var category: Bool
    public var definition: Bool
    /// Revealed letter positions, in reveal order.
    public var revealed: [Int]
}

public struct WordHintUse: Codable, Equatable, Sendable {
    public var category = 0, definition = 0, first = 0, extra = 0
    public var total: Int { category + definition + first + extra }
    public subscript(k: WordHintKind) -> Int {
        get { switch k { case .category: category; case .definition: definition; case .first: first; case .extra: extra } }
        set { switch k { case .category: category = newValue; case .definition: definition = newValue; case .first: first = newValue; case .extra: extra = newValue } }
    }
}

public enum WordHints {
    /// Free starting hints per difficulty (daily uses normal).
    public static func initial(_ d: WordDifficulty) -> WordCardHint {
        WordCardHint(category: d != .hard, definition: d == .easy, revealed: [])
    }

    /// Updated card, or nil if unavailable (already revealed / locked / nothing left).
    public static func apply(_ card: WordCardHint, _ kind: WordHintKind, word: String) -> WordCardHint? {
        var c = card
        switch kind {
        case .category: if card.category { return nil }; c.category = true; return c
        case .definition: if card.definition { return nil }; c.definition = true; return c
        case .first: if card.revealed.contains(0) { return nil }; c.revealed.append(0); return c
        case .extra:
            guard card.revealed.contains(0), let n = nextExtraPosition(card, word: word) else { return nil }
            c.revealed.append(n); return c
        }
    }

    public static func nextExtraPosition(_ card: WordCardHint, word: String) -> Int? {
        (0..<word.count).first { !card.revealed.contains($0) }
    }
    public static func isFullyRevealed(_ card: WordCardHint, word: String) -> Bool { card.revealed.count >= word.count }
    public static func masked(_ word: String, _ card: WordCardHint) -> [String?] {
        word.enumerated().map { i, ch in card.revealed.contains(i) ? String(ch) : nil }
    }
    public static func canApply(_ card: WordCardHint, _ kind: WordHintKind, word: String) -> Bool { apply(card, kind, word: word) != nil }
}
