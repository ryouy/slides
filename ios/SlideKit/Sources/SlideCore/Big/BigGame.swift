import Foundation

public enum BigStatus: String, Codable, Sendable { case playing, cleared }

/// One game in progress (port of logic/game.ts).
public struct BigState: Codable, Sendable, Equatable {
    public var puzzle: BigPuzzle
    public var pieces: [BigPiece]
    public var moves: Int
    public var bigMoves: Int
    public var elapsedMs: Int
    public var started: Bool
    public var status: BigStatus
    /// Piece whose direction arrows are shown (when a tap is ambiguous).
    public var selected: Int?

    public init(puzzle: BigPuzzle) {
        self.puzzle = puzzle; pieces = puzzle.initial; moves = 0; bigMoves = 0; elapsedMs = 0; started = false; status = .playing; selected = nil
    }

    public var size: Int { puzzle.size }

    /// Restart: the same puzzle from the beginning.
    public mutating func restart() { self = BigState(puzzle: puzzle) }

    public mutating func tick(ms: Int) { if status == .playing && started { elapsedMs += ms } }

    public mutating func select(_ id: Int?) { if status == .playing { selected = id } }

    public func legalDirs(_ id: Int) -> [BigDirection] { BigBoard.legalDirs(pieces, size, id) }

    /// Applies a move; illegal moves change nothing and are not counted. Returns whether the board changed.
    @discardableResult
    public mutating func move(id: Int, dir: BigDirection) -> Bool {
        if status == .cleared { return false }
        guard let next = BigBoard.movePiece(pieces, size, id, dir) else { return false }
        let isBig = BigBoard.piece(pieces, id)?.kind == .big
        pieces = next
        moves += 1
        if isBig { bigMoves += 1 }
        started = true
        selected = nil
        status = BigBoard.isSolved(next, puzzle.goal) ? .cleared : .playing
        return true
    }

    /// Basic sanity of a saved state (shape, board size, no overlaps, goal and pieces refer to the same ids).
    public var isValid: Bool {
        let n = puzzle.size
        guard bigBoardSizes.contains(n), moves >= 0, bigMoves >= 0, elapsedMs >= 0 else { return false }
        guard BigBoard.isValidLayout(pieces, n), BigBoard.isValidLayout(puzzle.goal, n) else { return false }
        guard pieces.count == puzzle.goal.count, Set(pieces.map(\.id)) == Set(puzzle.goal.map(\.id)) else { return false }
        return validateBigPuzzle(puzzle)
    }
}
