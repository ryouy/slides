import Foundation

// BIG SLIDE logic: port of src/games/big-slide/logic/* (Foundation only, no UI).

public enum BigDirection: String, Codable, CaseIterable, Sendable {
    case up, down, left, right
    public static let all: [BigDirection] = [.up, .down, .left, .right] // same order as the web's DIRS
    public var delta: (dr: Int, dc: Int) {
        switch self {
        case .up: (-1, 0)
        case .down: (1, 0)
        case .left: (0, -1)
        case .right: (0, 1)
        }
    }
    public var opposite: BigDirection {
        switch self { case .up: .down; case .down: .up; case .left: .right; case .right: .left }
    }
}

public enum BigDifficulty: String, Codable, CaseIterable, Sendable { case easy, normal, hard }
public enum BigMode: String, Codable, Sendable { case daily, endless }
public enum BigVariant: String, Codable, CaseIterable, Sendable { case classic, duo, shapes, mega }
public enum BigPieceKind: String, Codable, Sendable { case small, big }

public let bigBoardSizes: [Int] = [4, 5, 6]

public struct BigCell: Hashable, Codable, Sendable {
    public var r: Int
    public var c: Int
    public init(_ r: Int, _ c: Int) { self.r = r; self.c = c }
}

/// A piece: a 1x1 number tile, or a big block of any (possibly non-rectangular) shape.
public struct BigPiece: Hashable, Codable, Sendable {
    public var id: Int
    public var kind: BigPieceKind
    /// Bounding box size.
    public var w: Int
    public var h: Int
    /// Occupied cells as offsets from the top-left of the bounding box. Shapes never rotate.
    public var cells: [BigCell]
    /// Top-left of the bounding box.
    public var r: Int
    public var c: Int
    public var label: String

    public init(id: Int, kind: BigPieceKind, w: Int, h: Int, cells: [BigCell], r: Int, c: Int, label: String) {
        self.id = id; self.kind = kind; self.w = w; self.h = h; self.cells = cells; self.r = r; self.c = c; self.label = label
    }
    public var isRect: Bool { cells.count == w * h }
}

public struct BigMove: Hashable, Codable, Sendable {
    public var id: Int
    public var dir: BigDirection
    public init(id: Int, dir: BigDirection) { self.id = id; self.dir = dir }
}

public struct BigPuzzle: Codable, Sendable, Equatable {
    public var id: String
    public var mode: BigMode
    public var difficulty: BigDifficulty
    public var size: Int
    public var variant: BigVariant
    public var number: Int?
    public var goal: [BigPiece]
    public var initial: [BigPiece]
    /// A legal move sequence that solves `initial` (the generator's guarantee).
    public var solution: [BigMove]
    public var generatorVersion: String
}
