import Foundation

/// Board rules (port of logic/board.ts). Pieces live in an array; `grid` is the occupancy (piece id per cell, -1 blank).
public enum BigBoard {
    public static func buildGrid(_ pieces: [BigPiece], _ n: Int) -> [Int16] {
        var g = [Int16](repeating: -1, count: n * n)
        for p in pieces { for cell in p.cells { g[(p.r + cell.r) * n + p.c + cell.c] = Int16(p.id) } }
        return g
    }

    /// A piece may slide one cell iff every cell of its shifted shape is inside the board and blank (or its own).
    public static func canMoveOn(_ grid: [Int16], _ n: Int, _ p: BigPiece, _ dir: BigDirection) -> Bool {
        let d = dir.delta
        for cell in p.cells {
            let r = p.r + cell.r + d.dr, c = p.c + cell.c + d.dc
            if r < 0 || c < 0 || r >= n || c >= n { return false }
            let o = grid[r * n + c]
            if o != -1 && o != Int16(p.id) { return false }
        }
        return true
    }

    public static func piece(_ pieces: [BigPiece], _ id: Int) -> BigPiece? { pieces.first { $0.id == id } }

    public static func canMove(_ pieces: [BigPiece], _ n: Int, _ id: Int, _ dir: BigDirection) -> Bool {
        guard let p = piece(pieces, id) else { return false }
        return canMoveOn(buildGrid(pieces, n), n, p, dir)
    }

    /// New piece list with `id` moved one cell, or nil if illegal. Never mutates the input.
    public static func movePiece(_ pieces: [BigPiece], _ n: Int, _ id: Int, _ dir: BigDirection) -> [BigPiece]? {
        guard let i = pieces.firstIndex(where: { $0.id == id }), canMoveOn(buildGrid(pieces, n), n, pieces[i], dir) else { return nil }
        var out = pieces
        out[i].r += dir.delta.dr
        out[i].c += dir.delta.dc
        return out
    }

    public static func legalDirs(_ pieces: [BigPiece], _ n: Int, _ id: Int) -> [BigDirection] {
        guard let p = piece(pieces, id) else { return [] }
        let g = buildGrid(pieces, n)
        return BigDirection.all.filter { canMoveOn(g, n, p, $0) }
    }

    public static func legalMoves(_ pieces: [BigPiece], _ n: Int) -> [BigMove] {
        let g = buildGrid(pieces, n)
        var out: [BigMove] = []
        for p in pieces { for d in BigDirection.all where canMoveOn(g, n, p, d) { out.append(BigMove(id: p.id, dir: d)) } }
        return out
    }

    public static func blankCount(_ pieces: [BigPiece], _ n: Int) -> Int { n * n - pieces.reduce(0) { $0 + $1.cells.count } }

    /// Valid = inside the board, no overlaps.
    public static func isValidLayout(_ pieces: [BigPiece], _ n: Int) -> Bool {
        var seen = Set<Int>()
        for p in pieces {
            for cell in p.cells {
                let r = p.r + cell.r, c = p.c + cell.c
                if r < 0 || c < 0 || r >= n || c >= n || seen.contains(r * n + c) { return false }
                seen.insert(r * n + c)
            }
        }
        return true
    }

    /// Solved when every piece is at its own goal position.
    public static func isSolved(_ pieces: [BigPiece], _ goal: [BigPiece]) -> Bool {
        goal.allSatisfy { g in
            guard let p = piece(pieces, g.id) else { return false }
            return p.r == g.r && p.c == g.c
        }
    }

    /// Hashable key of a layout (positions of the pieces in array order).
    public static func stateKey(_ pieces: [BigPiece]) -> [UInt8] { pieces.map { UInt8(48 + $0.r * 8 + $0.c) } }

    public static func bigPieces(_ pieces: [BigPiece]) -> [BigPiece] { pieces.filter { $0.kind == .big } }

    /// All legal moves with their resulting layouts.
    public static func expand(_ pieces: [BigPiece], _ n: Int) -> [(move: BigMove, state: [BigPiece])] {
        let g = buildGrid(pieces, n)
        var out: [(BigMove, [BigPiece])] = []
        for i in pieces.indices {
            let p = pieces[i]
            for dir in BigDirection.all where canMoveOn(g, n, p, dir) {
                var s = pieces
                s[i].r += dir.delta.dr
                s[i].c += dir.delta.dc
                out.append((BigMove(id: p.id, dir: dir), s))
            }
        }
        return out
    }
}
