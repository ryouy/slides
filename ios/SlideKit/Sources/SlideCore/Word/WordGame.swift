import Foundation

/// One CHECK: a chosen board row compared with a chosen word card.
public struct WordCheckEntry: Codable, Equatable, Sendable {
    public var row: Int
    public var card: Int
    public var cells: [String?]
    public var marks: [WordMark?]
    public var found: Int
}

public enum WordStatus: String, Codable, Sendable { case playing, cleared }

public enum WordAction: Equatable, Sendable {
    case move(Int)
    case dir(WordDirection)
    case check
    case hint(card: Int, kind: WordHintKind)
    case selRow(Int)
    case selCard(Int)
    case restart
    case tick(Int)
}

/// Port of src/core/game.ts.
public struct WordGameState: Codable, Equatable, Sendable {
    public var puzzle: WordPuzzle
    public var board: WordBoard
    public var moves = 0
    public var checks = 0
    public var elapsedMs = 0
    /// The timer starts on the first move, check or hint.
    public var started = false
    public var status: WordStatus = .playing
    public var marks: [WordMark?]?
    public var history: [WordCheckEntry] = []
    public var cards: [WordCardHint]
    public var hintUse = WordHintUse()
    public var selRow: Int?
    public var selCard: Int?

    public init(puzzle: WordPuzzle) {
        self.puzzle = puzzle
        board = WordBoardOps.board(from: puzzle.letters)
        cards = puzzle.clues.map { _ in WordHints.initial(puzzle.difficulty) }
    }

    public var found: WordFound { WordMatcher.match(WordBoardOps.letters(of: board), puzzle.words) }
    /// Hints used including CHECKs (free starting hints are not counted).
    public var hintsUsed: Int { hintUse.total + checks }
    public var isNoHintClear: Bool { status == .cleared && hintsUsed == 0 }
    public static func isValidPair(row: Int, card: Int) -> Bool { (row == 3) == (card == 3) }
    public var canCheck: Bool {
        guard let r = selRow, let c = selCard else { return false }
        return Self.isValidPair(row: r, card: c)
    }

    /// Sanity check for restored saves.
    public var isValid: Bool {
        puzzle.clues.count == 4 && cards.count == 4 && board.count == 16 && board.filter { $0 == nil }.count == 1
            && WordBoardOps.isValidBoard(board) && puzzle.letters.count == 16 && puzzle.words.top.count == 3
            && moves >= 0 && checks >= 0 && elapsedMs >= 0
    }

    @discardableResult
    public mutating func apply(_ a: WordAction) -> Bool {
        let before = self
        self = Self.reduce(self, a)
        return self != before
    }

    public static func reduce(_ s: WordGameState, _ a: WordAction) -> WordGameState {
        if case .restart = a { return WordGameState(puzzle: s.puzzle) }
        if s.status == .cleared { return s }
        var s = s
        switch a {
        case .restart: return s
        case .tick(let ms):
            if s.started { s.elapsedMs += ms }
            return s
        case .move, .dir:
            let cell: Int?
            if case .move(let c) = a { cell = c } else if case .dir(let d) = a { cell = WordBoardOps.tileForDirection(s.board, d) } else { cell = nil }
            guard let cell, let board = WordBoardOps.moveTile(s.board, cell) else { return s }
            let solved = WordMatcher.match(WordBoardOps.letters(of: board), s.puzzle.words).solved
            s.board = board; s.moves += 1; s.started = true; s.marks = nil; s.status = solved ? .cleared : .playing
            return s
        case .selRow(let r):
            if r < 0 || r > 3 { return s }
            if s.selRow == r { s.selRow = nil; return s }
            if r == 3 { s.selCard = 3 } else if let c = s.selCard, c < 3 { s.selCard = c } else { s.selCard = nil }
            s.selRow = r
            return s
        case .selCard(let c):
            if c < 0 || c > 3 { return s }
            if s.selCard == c { s.selCard = nil; return s }
            if c == 3 { s.selRow = 3 } else if let r = s.selRow, r < 3 { s.selRow = r } else { s.selRow = nil }
            s.selCard = c
            return s
        case .check:
            guard let r = s.selRow, let c = s.selCard, isValidPair(row: r, card: c) else { return s }
            let letters = WordBoardOps.letters(of: s.board)
            let (cells, marks) = WordWordle.checkRow(letters, row: r, word: s.puzzle.clues[c].word)
            var bm = [WordMark?](repeating: nil, count: 16)
            for (i, m) in marks.enumerated() { bm[r * 4 + i] = m }
            s.history.append(WordCheckEntry(row: r, card: c, cells: cells, marks: marks, found: WordMatcher.match(letters, s.puzzle.words).count))
            s.checks += 1; s.started = true; s.marks = bm
            return s
        case .hint(let card, let kind):
            guard card >= 0, card < s.puzzle.clues.count, let next = WordHints.apply(s.cards[card], kind, word: s.puzzle.clues[card].word) else { return s }
            s.cards[card] = next; s.started = true; s.hintUse[kind] += 1
            return s
        }
    }
}
