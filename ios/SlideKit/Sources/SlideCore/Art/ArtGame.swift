import Foundation

/// Port of game.ts: the state of one running puzzle and the rules that change it.
public struct ArtState: Codable, Hashable, Sendable {
    public var puzzle: ArtPuzzle
    public var board: ArtBoard
    public var moves: Int
    public var elapsedMs: Int
    /// The timer starts at the first legal move.
    public var started: Bool
    public var status: Status
    /// Where the blank has been since the start (keeps `puzzle.solution` valid after a shuffle).
    public var blankPath: [Int]
    public enum Status: String, Codable, Sendable { case playing, cleared }

    public init(puzzle: ArtPuzzle) {
        self.puzzle = puzzle; board = puzzle.initial; moves = 0; elapsedMs = 0; started = false; status = .playing
        blankPath = [Board.blankIndex(puzzle.initial)]
    }
    public var dims: Dims { puzzle.dims }
    public var cleared: Bool { status == .cleared }

    /// Same arrangement again from the start.
    public mutating func restart() { self = ArtState(puzzle: puzzle) }

    /// SHUFFLE: one slide of the shuffle (not counted, works even on a finished board).
    @discardableResult
    public mutating func slideStep(_ cell: Int) -> Bool {
        guard let b = Board.moveTile(board, dims, cell) else { return false }
        board = b; status = .playing; blankPath.append(cell)
        return true
    }

    /// One tile into the blank (counts as one move). Returns false if illegal or the game is over.
    @discardableResult
    public mutating func move(_ cell: Int) -> Bool {
        guard !cleared, let b = Board.moveTile(board, dims, cell) else { return false }
        board = b; moves += 1; started = true; blankPath.append(cell)
        status = Board.isSolved(b) ? .cleared : .playing
        return true
    }

    /// Every aligned tile at once, each counted as one move. Returns the cells slid (empty if nothing happened).
    @discardableResult
    public mutating func lineMove(_ cell: Int) -> [Int] {
        guard !cleared else { return [] }
        let cells = Board.lineSlideCells(board, dims, cell)
        guard !cells.isEmpty else { return [] }
        var b = board
        for c in cells { guard let n = Board.moveTile(b, dims, c) else { return [] }; b = n }
        board = b; moves += cells.count; started = true; blankPath.append(contentsOf: cells)
        status = Board.isSolved(b) ? .cleared : .playing
        return cells
    }

    @discardableResult
    public mutating func move(direction: ArtDirection) -> Bool {
        guard let c = Board.tileForDirection(board, dims, direction) else { return false }
        return move(c)
    }

    public mutating func tick(ms: Int) { if started && !cleared { elapsedMs += ms } }

    /// A saved state is only resumed if it is internally consistent.
    public var isValid: Bool {
        artLevels.contains(puzzle.size) && puzzle.cols > 0 && puzzle.rows > 0
            && Board.isValid(board, dims) && puzzle.initial.count == dims.count && Board.isValid(puzzle.initial, dims)
            && moves >= 0 && elapsedMs >= 0
    }
}
