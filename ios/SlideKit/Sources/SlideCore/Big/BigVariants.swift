import Foundation

/// Shapes of big blocks. They never rotate, so each orientation is its own shape.
public enum BigShapes {
    public static let O: [BigCell] = [BigCell(0, 0), BigCell(0, 1), BigCell(1, 0), BigCell(1, 1)]
    public static let L: [BigCell] = [BigCell(0, 0), BigCell(1, 0), BigCell(2, 0), BigCell(2, 1)]
    public static let T: [BigCell] = [BigCell(0, 0), BigCell(0, 1), BigCell(0, 2), BigCell(1, 1)]
    public static let D: [BigCell] = [BigCell(0, 0), BigCell(0, 1)]
    public static let R23: [BigCell] = [BigCell(0, 0), BigCell(0, 1), BigCell(0, 2), BigCell(1, 0), BigCell(1, 1), BigCell(1, 2)]
    public static let small: [BigCell] = [BigCell(0, 0)]
}

public struct BigVariantConfig: Sendable {
    public let label: String
    public let blanks: Int
    /// Big blocks in id order (ids 0..n-1).
    public let bigs: [(cells: [BigCell], label: String)]
}

public func bigVariantConfig(_ v: BigVariant) -> BigVariantConfig {
    switch v {
    case .classic: BigVariantConfig(label: "Classic", blanks: 2, bigs: [(BigShapes.O, "BIG")])
    case .duo: BigVariantConfig(label: "Duo", blanks: 3, bigs: [(BigShapes.O, "A"), (BigShapes.O, "B")])
    case .shapes: BigVariantConfig(label: "Shapes", blanks: 3, bigs: [(BigShapes.L, "L"), (BigShapes.D, "D")])
    case .mega: BigVariantConfig(label: "Mega", blanks: 3, bigs: [(BigShapes.R23, "XL")])
    }
}

public func bigBounds(_ cells: [BigCell]) -> (h: Int, w: Int) {
    (cells.map(\.r).max()! + 1, cells.map(\.c).max()! + 1)
}
public func bigArea(_ v: BigVariant) -> Int { bigVariantConfig(v).bigs.reduce(0) { $0 + $1.cells.count } }

/// Number of numbered 1x1 tiles for a board size and variant.
public func bigSmallCount(_ size: Int, _ v: BigVariant = .classic) -> Int { size * size - bigArea(v) - bigVariantConfig(v).blanks }

public func makeBigPiece(id: Int, variant v: BigVariant, r: Int, c: Int) -> BigPiece {
    let b = bigVariantConfig(v).bigs[id]
    let bb = bigBounds(b.cells)
    return BigPiece(id: id, kind: .big, w: bb.w, h: bb.h, cells: b.cells, r: r, c: c, label: b.label)
}
