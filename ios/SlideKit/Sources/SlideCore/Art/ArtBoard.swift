import Foundation

/// Port of src/games/art-slide/logic/board.ts, grid.ts, tiles.ts.
/// A cell holds a tile id (= the cell it belongs to when solved) or nil for the single blank.
public typealias ArtBoard = [Int?]

public let artLevels: [Int] = [3, 4, 5, 6, 7]
public enum ArtDirection: Sendable { case up, down, left, right }

/// Columns x rows of the board. Follows the painting's proportions, so nothing is cropped.
public struct Dims: Codable, Hashable, Sendable {
    public var cols: Int
    public var rows: Int
    public init(cols: Int, rows: Int) { self.cols = cols; self.rows = rows }
    public var count: Int { cols * rows }
}

public enum Board {
    public static func solved(_ d: Dims) -> ArtBoard {
        let n = d.count
        return (0..<n).map { $0 == n - 1 ? nil : $0 }
    }
    public static func blankIndex(_ b: ArtBoard) -> Int { b.firstIndex(where: { $0 == nil }) ?? -1 }

    /// Solved = every tile on its home cell and the blank in the bottom-right corner.
    public static func isSolved(_ b: ArtBoard) -> Bool {
        for (i, t) in b.enumerated() {
            if i == b.count - 1 { if t != nil { return false } } else if t != i { return false }
        }
        return true
    }

    /// Order matches the web (up, down, left, right): the shuffle's random choices depend on it.
    public static func neighbors(_ i: Int, _ d: Dims) -> [Int] {
        let r = i / d.cols, c = i % d.cols
        var out: [Int] = []
        if r > 0 { out.append(i - d.cols) }
        if r < d.rows - 1 { out.append(i + d.cols) }
        if c > 0 { out.append(i - 1) }
        if c < d.cols - 1 { out.append(i + 1) }
        return out
    }

    /// Legal one-cell slides from the blank toward a tapped tile in its row/column (closest piece first).
    public static func lineSlideCells(_ b: ArtBoard, _ d: Dims, _ cell: Int) -> [Int] {
        guard cell >= 0, cell < b.count, b[cell] != nil, b.count == d.count else { return [] }
        let blank = blankIndex(b)
        guard blank >= 0 else { return [] }
        let sameRow = blank / d.cols == cell / d.cols
        let sameCol = blank % d.cols == cell % d.cols
        guard sameRow || sameCol else { return [] }
        let step = sameRow ? (cell > blank ? 1 : -1) : (cell > blank ? d.cols : -d.cols)
        var cells: [Int] = []
        var cursor = blank + step
        while true {
            cells.append(cursor)
            if cursor == cell { break }
            cursor += step
        }
        return cells
    }

    /// Only a tile orthogonally next to the blank can move.
    public static func canMove(_ b: ArtBoard, _ d: Dims, _ cell: Int) -> Bool {
        guard cell >= 0, cell < b.count, b[cell] != nil else { return false }
        return neighbors(cell, d).contains(blankIndex(b))
    }

    public static func moveTile(_ b: ArtBoard, _ d: Dims, _ cell: Int) -> ArtBoard? {
        guard canMove(b, d, cell) else { return nil }
        let blank = blankIndex(b)
        var next = b
        next[blank] = b[cell]
        next[cell] = nil
        return next
    }

    /// The cell of the tile that would travel in `dir` into the blank, or nil.
    public static func tileForDirection(_ b: ArtBoard, _ d: Dims, _ dir: ArtDirection) -> Int? {
        let blank = blankIndex(b)
        guard blank >= 0 else { return nil }
        let r = blank / d.cols, c = blank % d.cols
        switch dir {
        case .left: return c < d.cols - 1 ? blank + 1 : nil
        case .right: return c > 0 ? blank - 1 : nil
        case .up: return r < d.rows - 1 ? blank + d.cols : nil
        case .down: return r > 0 ? blank - d.cols : nil
        }
    }

    public static func isValid(_ b: ArtBoard, _ d: Dims) -> Bool {
        guard d.cols > 0, d.rows > 0, b.count == d.count else { return false }
        guard b.filter({ $0 == nil }).count == 1 else { return false }
        let ids = b.compactMap { $0 }.sorted()
        return ids.enumerated().allSatisfy { $0.element == $0.offset }
    }

    public static func misplacedCount(_ b: ArtBoard) -> Int {
        var n = 0
        for (i, t) in b.enumerated() { if t != (i == b.count - 1 ? nil : i) { n += 1 } }
        return n
    }

    /// Which tile direction a swipe on `cell` must have to slide it (and the tiles between) toward the blank; nil if not aligned.
    public static func slideDirection(_ b: ArtBoard, _ d: Dims, _ cell: Int) -> ArtDirection? {
        let blank = blankIndex(b)
        guard blank >= 0, cell != blank else { return nil }
        if cell % d.cols == blank % d.cols { return blank > cell ? .down : .up }
        if cell / d.cols == blank / d.cols { return blank > cell ? .right : .left }
        return nil
    }
}

public enum ArtGrid {
    /// Number of columns and rows for a painting of the given aspect ratio (width / height); same algorithm as grid.ts.
    public static func gridFor(aspect: Double, level: Int) -> Dims {
        let target = Double(level * level)
        var floorCount = 0
        if level > 3 { let e = gridFor(aspect: aspect, level: level - 1); floorCount = e.cols * e.rows }
        var best = Dims(cols: level, rows: level)
        var bestCost = Double.infinity
        for cols in 2...12 {
            for rows in 2...12 {
                let count = cols * rows
                if count < 6 || count <= floorCount { continue }
                let tileAspect = (aspect * Double(rows)) / Double(cols)
                let cost = abs(log(tileAspect)) * 6 + abs(log(Double(count) / target)) * 1.5
                if cost < bestCost - 1e-9 { bestCost = cost; best = Dims(cols: cols, rows: rows) }
            }
        }
        return best
    }
    public static func aspect(width: Int, height: Int) -> Double { Double(width) / Double(max(height, 1)) }
}
