import Foundation

/// Port of generator.ts, reshuffle.ts. The same seed gives the same board as the TypeScript version.
public let artGeneratorVersion = "a2"
public let artDailySize = 4

public struct ArtPuzzle: Codable, Hashable, Sendable {
    public var id: String
    public var mode: Mode
    public var size: Int
    public var cols: Int
    public var rows: Int
    public var artworkId: String
    public var number: Int?
    public var initial: ArtBoard
    /// Cells to tap, in order, that solve `initial` (the generator's guarantee).
    public var solution: [Int]
    public var generatorVersion: String
    public enum Mode: String, Codable, Sendable { case daily, endless }
    public var dims: Dims { Dims(cols: cols, rows: rows) }

    public init(id: String, mode: Mode, size: Int, cols: Int, rows: Int, artworkId: String, number: Int? = nil, initial: ArtBoard, solution: [Int], generatorVersion: String = artGeneratorVersion) {
        self.id = id; self.mode = mode; self.size = size; self.cols = cols; self.rows = rows
        self.artworkId = artworkId; self.number = number; self.initial = initial; self.solution = solution; self.generatorVersion = generatorVersion
    }
}

public enum ArtGenerator {
    static let base: [Int: Int] = [3: 40, 4: 110, 5: 240, 6: 360, 7: 500]

    public static func scrambleSteps(level: Int, _ d: Dims) -> (steps: Int, minMisplaced: Int) {
        let count = d.count
        let steps = (Double(base[level] ?? 40) * pow(Double(count) / Double(level * level), 1.5)).rounded()
        return (Int(steps), max(4, Int((Double(count) * 0.6).rounded())))
    }

    private static func key(_ b: ArtBoard) -> [Int] { b.map { $0 ?? -1 } }

    /// Random walk from the solved board with legal moves only, so the result is always solvable.
    public static func shuffleBoard(_ rng: Rng, level: Int, _ d: Dims) -> (board: ArtBoard, solution: [Int]) {
        let (steps, minMisplaced) = scrambleSteps(level: level, d)
        var board = Board.solved(d)
        var blank = d.count - 1
        var prev = -1
        var visited: Set<[Int]> = [key(board)]
        var path = [blank]
        for i in 0..<(steps + 400) {
            if i >= steps && Board.misplacedCount(board) >= minMisplaced && !Board.isSolved(board) { break }
            let options = Board.neighbors(blank, d).filter { $0 != prev }
            let fresh = options.filter { c in
                var b = board; b[blank] = b[c]; b[c] = nil
                return !visited.contains(key(b))
            }
            let next = pick(rng, fresh.isEmpty ? options : fresh)
            board = Board.moveTile(board, d, next)!
            visited.insert(key(board))
            prev = blank
            blank = next
            path.append(blank)
        }
        return (board, Array(path.dropLast().reversed()))
    }

    /// Random walk from ANY board (SHUFFLE): the returned `clicks` are the tiles to slide, in order.
    public static func shuffleFromBoard(_ rng: Rng, _ d: Dims, start: ArtBoard, steps: Int, minMisplaced: Int) -> (board: ArtBoard, clicks: [Int]) {
        var board = start
        var blank = Board.blankIndex(start)
        var prev = -1
        let startKey = key(board)
        var visited: Set<[Int]> = [startKey]
        var clicks: [Int] = []
        let maxSteps = steps + Int((Double(steps) * 0.25).rounded(.up))
        for i in 0..<maxSteps {
            if i >= steps && Board.misplacedCount(board) >= minMisplaced && !Board.isSolved(board) && key(board) != startKey { break }
            let options = Board.neighbors(blank, d).filter { $0 != prev }
            let fresh = options.filter { c in
                var b = board; b[blank] = b[c]; b[c] = nil
                return !visited.contains(key(b))
            }
            let next = pick(rng, fresh.isEmpty ? options : fresh)
            board = Board.moveTile(board, d, next)!
            visited.insert(key(board))
            prev = blank
            blank = next
            clicks.append(next)
        }
        return (board, clicks)
    }

    public static func visibleShuffleSteps(_ d: Dims) -> (steps: Int, minMisplaced: Int) {
        let count = Double(d.count)
        return (Int((14 + 0.85 * count + 0.013 * count * count).rounded()), max(4, Int((count * 0.5).rounded())))
    }

    /// Time between actual tile slides while shuffling (seconds): never quicker than 110 ms.
    public static func visibleShuffleStep(_ d: Dims) -> Double {
        Double(max(110, Int((190 - 10 * Double(d.count).squareRoot()).rounded()))) / 1000
    }

    public static func validate(_ p: ArtPuzzle) -> Bool {
        let d = p.dims
        guard p.initial.count == d.count, p.initial.filter({ $0 == nil }).count == 1, !Board.isSolved(p.initial) else { return false }
        var b = p.initial
        for c in p.solution {
            guard let n = Board.moveTile(b, d, c) else { return false }
            b = n
        }
        return Board.isSolved(b)
    }

    public static func generate(seed: String, id: String, mode: ArtPuzzle.Mode, size: Int, artworkId: String, aspect: Double, number: Int? = nil) -> ArtPuzzle {
        let d = ArtGrid.gridFor(aspect: aspect, level: size)
        for attempt in 0..<20 {
            let rng = rngFromString("\(artGeneratorVersion)|\(seed)|\(size)|\(attempt)")
            let (board, solution) = shuffleBoard(rng, level: size, d)
            let p = ArtPuzzle(id: id, mode: mode, size: size, cols: d.cols, rows: d.rows, artworkId: artworkId, number: number, initial: board, solution: solution)
            if validate(p) { return p }
        }
        // cannot happen in practice: fall back to a trivially solvable one-move puzzle
        var b = Board.solved(d); let n = d.count
        b[n - 1] = b[n - 2]; b[n - 2] = nil
        return ArtPuzzle(id: id, mode: mode, size: size, cols: d.cols, rows: d.rows, artworkId: artworkId, number: number, initial: b, solution: [n - 1])
    }

    public static func generateDaily(dateKey: String, artworkId: String, aspect: Double) -> ArtPuzzle {
        generate(seed: "daily|\(dateKey)", id: "artdaily-\(dateKey)", mode: .daily, size: artDailySize, artworkId: artworkId, aspect: aspect, number: DateKeys.dailyNumber(dateKey))
    }

    public static func generateFree(artworkId: String, size: Int, aspect: Double, seed: String = "\(Date().timeIntervalSince1970)-\(Double.random(in: 0..<1))") -> ArtPuzzle {
        generate(seed: "free|\(seed)", id: "art-\(artworkId)-\(size)-\(seed)", mode: .endless, size: size, artworkId: artworkId, aspect: aspect)
    }

    // MARK: reshuffle

    public struct ReshufflePlan: Sendable { public let clicks: [Int]; public let puzzle: ArtPuzzle }

    /// Removes immediate back-and-forth of the blank (x, y, x -> x).
    public static func reduceBlankPath(_ path: [Int]) -> [Int] {
        var out: [Int] = []
        for v in path {
            if out.count >= 2 && out[out.count - 2] == v { out.removeLast() } else { out.append(v) }
        }
        return out
    }

    /// SHUFFLE: a random walk of legal slides from what is on screen; the new `solution` is the blank's whole journey run backwards.
    public static func planReshuffle(_ state: ArtState, seed: String) -> ReshufflePlan {
        let d = state.puzzle.dims
        let (steps, minMisplaced) = visibleShuffleSteps(d)
        let rng = rngFromString("\(artGeneratorVersion)|shuffle|\(seed)|\(d.cols)x\(d.rows)")
        let (board, clicks) = shuffleFromBoard(rng, d, start: state.board, steps: steps, minMisplaced: minMisplaced)
        let daily = state.puzzle.mode == .daily
        let initialBlank = Board.blankIndex(state.puzzle.initial)
        let scramble = Array(state.puzzle.solution.reversed()) + [initialBlank]
        let played = Array((state.blankPath.isEmpty ? [initialBlank] : state.blankPath).dropFirst())
        let full = reduceBlankPath(scramble + played + clicks)
        let puzzle = ArtPuzzle(
            id: daily ? state.puzzle.id : "art-\(state.puzzle.artworkId)-\(state.puzzle.size)-\(seed)",
            mode: daily ? .daily : .endless,
            size: state.puzzle.size, cols: d.cols, rows: d.rows, artworkId: state.puzzle.artworkId,
            number: daily ? state.puzzle.number : nil,
            initial: board, solution: Array(full.dropLast().reversed()))
        return ReshufflePlan(clicks: clicks, puzzle: puzzle)
    }
}
