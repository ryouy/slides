import Foundation

/// Bump when the generation algorithm changes (it changes which puzzle a seed yields).
public let bigGeneratorVersion = "b1"

public struct BigLevel: Sendable {
    public var minLen: Int
    public var maxLen: Int
    public var radius: Int
    public var minBigShift: Int
    public var minBigMoves: Int
    public var exact: Bool
    public var steps: Int
}

private let maxBallNodes = 15000

public func bigLevelFor(_ difficulty: BigDifficulty, size: Int = 4, variant: BigVariant = .classic) -> BigLevel {
    let l: BigLevel
    switch difficulty {
    case .easy: l = BigLevel(minLen: 5, maxLen: 8, radius: 8, minBigShift: 1, minBigMoves: 1, exact: true, steps: 0)
    case .normal: l = BigLevel(minLen: 12, maxLen: 16, radius: 8, minBigShift: 1, minBigMoves: 1, exact: true, steps: 0)
    case .hard: l = BigLevel(minLen: 20, maxLen: 60, radius: 0, minBigShift: 1, minBigMoves: 2, exact: false, steps: 0)
    }
    if variant == .classic { return l }
    let bigs = bigVariantConfig(variant).bigs.count
    let minBigMoves = max(l.minBigMoves, bigs)
    struct Band { var easy: (Int, Int); var normal: (Int, Int); var hard: Int }
    let b: Band
    switch variant {
    case .duo: b = Band(easy: (4, 8), normal: (10, 16), hard: 18)
    case .shapes: b = Band(easy: (4, 7), normal: (8, 11), hard: 12)
    default: b = Band(easy: (4, 8), normal: (10, 15), hard: 16)
    }
    var o = l
    switch difficulty {
    case .easy:
        o.minLen = b.easy.0; o.maxLen = b.easy.1; o.radius = b.easy.1; o.minBigMoves = minBigMoves
    case .normal:
        o.minLen = b.normal.0; o.maxLen = b.normal.1; o.radius = 8; o.minBigMoves = minBigMoves
    case .hard:
        if size == 4 && variant != .shapes {
            o.exact = true; o.minLen = b.hard; o.maxLen = 24; o.radius = 12; o.minBigMoves = max(3, minBigMoves)
        } else {
            o.minLen = variant == .shapes ? b.hard : b.hard - 4
            o.minBigMoves = max(3, minBigMoves)
        }
    }
    return o
}

/// Goal layout: big blocks at random non-overlapping positions; numbers 1..k fill the rest in reading order, last cells stay blank.
public func bigMakeGoal(_ rng: Rng, size: Int, variant: BigVariant = .classic) throws -> [BigPiece] {
    let cfg = bigVariantConfig(variant)
    var pieces: [BigPiece] = []
    var taken = Set<Int>()
    for restart in 0..<100 {
        pieces = []
        taken = []
        var ok = true
        var id = 0
        while id < cfg.bigs.count && ok {
            ok = false
            var attempt = 0
            while attempt < 60 && !ok {
                attempt += 1
                let probe = makeBigPiece(id: id, variant: variant, r: 0, c: 0)
                let r = randInt(rng, size - probe.h + 1)
                let c = randInt(rng, size - probe.w + 1)
                let cand = makeBigPiece(id: id, variant: variant, r: r, c: c)
                let cells = cand.cells.map { (r + $0.r) * size + c + $0.c }
                if cells.contains(where: { taken.contains($0) }) { continue }
                cells.forEach { taken.insert($0) }
                pieces.append(cand)
                ok = true
            }
            id += 1
        }
        if ok { break }
        if restart == 99 { throw BigError.generationFailed }
    }
    var free: [(Int, Int)] = []
    for r in 0..<size { for c in 0..<size where !taken.contains(r * size + c) { free.append((r, c)) } }
    let base = cfg.bigs.count
    for (i, rc) in free.prefix(free.count - cfg.blanks).enumerated() {
        pieces.append(BigPiece(id: base + i, kind: .small, w: 1, h: 1, cells: BigShapes.small, r: rc.0, c: rc.1, label: String(i + 1)))
    }
    return pieces
}

public enum BigError: Error { case generationFailed }

typealias BigKey = [UInt8]

struct BigNode {
    var state: [BigPiece]
    var from: BigKey?
    var move: BigMove?
    var d: Int
}

struct BigBall {
    var nodes: [BigKey: BigNode]
    /// Insertion order of `nodes` (the web iterates a Map in insertion order; ties depend on it).
    var order: [BigKey]
    var layers: [[BigKey]]
    var radius: Int
}

/// Breadth-first ball of the given radius around `start` (exact shortest distances).
func bigBuildBall(_ start: [BigPiece], size: Int, radius: Int, maxNodes: Int = Int.max) -> BigBall {
    let k0 = BigBoard.stateKey(start)
    var nodes: [BigKey: BigNode] = [k0: BigNode(state: start, from: nil, move: nil, d: 0)]
    var order = [k0]
    var layers: [[BigKey]] = [[k0]]
    var done = 0
    if radius >= 1 {
        for d in 1...radius {
            if nodes.count > maxNodes { break }
            var layer: [BigKey] = []
            for pk in layers[d - 1] {
                let cur = nodes[pk]!.state
                for (move, ns) in BigBoard.expand(cur, size) {
                    let k = BigBoard.stateKey(ns)
                    if nodes[k] != nil { continue }
                    nodes[k] = BigNode(state: ns, from: pk, move: move, d: d)
                    order.append(k)
                    layer.append(k)
                }
            }
            layers.append(layer)
            done = d
        }
    }
    return BigBall(nodes: nodes, order: order, layers: layers, radius: done)
}

/// Moves leading from the ball's centre out to `key`.
func bigPathOut(_ ball: BigBall, _ key: BigKey) -> [BigMove] {
    var out: [BigMove] = []
    var n = ball.nodes[key]!
    while let f = n.from { out.append(n.move!); n = ball.nodes[f]! }
    return out.reversed()
}

/// Optimal solution (initial -> goal) if its length is <= 2 * radius, else nil.
func bigOptimalSolution(_ initial: [BigPiece], size: Int, goalBall: BigBall, radius: Int) -> [BigMove]? {
    let a = bigBuildBall(initial, size: size, radius: radius)
    var best: (key: BigKey, total: Int)?
    for k in a.order {
        let na = a.nodes[k]!
        if let nb = goalBall.nodes[k], best == nil || na.d + nb.d < best!.total { best = (k, na.d + nb.d) }
    }
    guard let b = best else { return nil }
    let forward = bigPathOut(a, b.key)
    let back = bigPathOut(goalBall, b.key).reversed().map { BigMove(id: $0.id, dir: $0.dir.opposite) }
    return forward + back
}

/// Manhattan distance between each big block's start and goal position.
public func bigDisplacements(_ pieces: [BigPiece], _ goal: [BigPiece]) -> [Int] {
    BigBoard.bigPieces(goal).map { g in
        let p = BigBoard.piece(pieces, g.id)!
        return abs(p.r - g.r) + abs(p.c - g.c)
    }
}
public func bigShift(_ pieces: [BigPiece], _ goal: [BigPiece]) -> Int { bigDisplacements(pieces, goal).reduce(0, +) }

private func bigIds(_ goal: [BigPiece]) -> Set<Int> { Set(BigBoard.bigPieces(goal).map(\.id)) }
private func countBig(_ moves: [BigMove], _ ids: Set<Int>) -> Int { moves.filter { ids.contains($0.id) }.count }

private func meetsLevel(_ initial: [BigPiece], _ goal: [BigPiece], _ solution: [BigMove], _ level: BigLevel) -> Bool {
    !BigBoard.isSolved(initial, goal)
        && solution.count >= level.minLen
        && solution.count <= level.maxLen
        && bigDisplacements(initial, goal).allSatisfy { $0 >= 1 }
        && bigShift(initial, goal) >= level.minBigShift
        && countBig(solution, bigIds(goal)) >= level.minBigMoves
}

/// Replays the stored solution through the real move rules.
public func validateBigPuzzle(_ p: BigPuzzle) -> Bool {
    let n = p.size
    guard bigBoardSizes.contains(n), BigBoard.isValidLayout(p.initial, n), BigBoard.isValidLayout(p.goal, n) else { return false }
    let cfg = bigVariantConfig(p.variant)
    if BigBoard.blankCount(p.initial, n) != cfg.blanks || p.initial.count != bigSmallCount(n, p.variant) + cfg.bigs.count { return false }
    if BigBoard.isSolved(p.initial, p.goal) { return false }
    if bigDisplacements(p.initial, p.goal).contains(where: { $0 < 1 }) { return false }
    var cur = p.initial
    for m in p.solution {
        guard let next = BigBoard.movePiece(cur, n, m.id, m.dir) else { return false }
        cur = next
    }
    return BigBoard.isSolved(cur, p.goal)
}

public struct BigGenerateOptions: Sendable {
    public var seed: String
    public var id: String
    public var mode: BigMode
    public var difficulty: BigDifficulty
    public var size: Int
    public var variant: BigVariant = .classic
    public var number: Int?
    public init(seed: String, id: String, mode: BigMode, difficulty: BigDifficulty, size: Int, variant: BigVariant = .classic, number: Int? = nil) {
        self.seed = seed; self.id = id; self.mode = mode; self.difficulty = difficulty; self.size = size; self.variant = variant; self.number = number
    }
}

/// Scramble that is guaranteed to move the big blocks several times. Returns the visited states from the goal to the scrambled board.
func bigChain(_ rng: Rng, goal: [BigPiece], size: Int, bigMoves: Int, radius: Int = 7) -> [[BigPiece]] {
    var cur = goal
    var states: [[BigPiece]] = [goal]
    var lastBig: BigMove?
    let ids = Array(bigIds(goal)).sorted() // goal ids of big blocks are 0..n-1 (the web's Set preserves insertion = id order)
    for _ in 0..<max(0, bigMoves) {
        let ball = bigBuildBall(cur, size: size, radius: radius)
        struct Opt { var key: BigKey; var id: Int; var dir: BigDirection; var away: Bool }
        var options: [Opt] = []
        var d = 0
        while d < ball.layers.count && options.count < 6 {
            for key in ball.layers[d] {
                let st = ball.nodes[key]!.state
                for id in ids {
                    let p = BigBoard.piece(st, id)!
                    let g = BigBoard.piece(goal, id)!
                    for dir in BigBoard.legalDirs(st, size, id) {
                        if let lb = lastBig, lb.id == id, dir == lb.dir.opposite { continue }
                        let dl = dir.delta
                        let away = abs(p.r + dl.dr - g.r) + abs(p.c + dl.dc - g.c) > abs(p.r - g.r) + abs(p.c - g.c)
                        options.append(Opt(key: key, id: id, dir: dir, away: away))
                    }
                }
            }
            d += 1
        }
        if options.isEmpty { break }
        let aways = options.filter(\.away)
        let pool = aways.isEmpty ? options : aways
        let o = pool[randInt(rng, pool.count)]
        for m in bigPathOut(ball, o.key) {
            cur = BigBoard.movePiece(cur, size, m.id, m.dir)!
            states.append(cur)
        }
        cur = BigBoard.movePiece(cur, size, o.id, o.dir)!
        states.append(cur)
        lastBig = BigMove(id: o.id, dir: o.dir)
    }
    return states
}

/// Shortens a solution path by local breadth-first search (jump to the furthest later state reachable within `depth` moves).
func bigShortenPath(_ states: [[BigPiece]], _ moves: [BigMove], size: Int, depth: Int = 7) -> (states: [[BigPiece]], moves: [BigMove]) {
    var st = states
    var mv = moves
    for _ in 0..<4 {
        var idx: [BigKey: Int] = [:]
        for (i, x) in st.enumerated() { idx[BigBoard.stateKey(x)] = i } // later duplicates win, like new Map(entries)
        var outStates: [[BigPiece]] = [st[0]]
        var outMoves: [BigMove] = []
        var i = 0
        while i < st.count - 1 {
            let startKey = BigBoard.stateKey(st[i])
            struct Par { var from: BigKey; var move: BigMove; var state: [BigPiece] }
            var parent: [BigKey: Par] = [:]
            var seen: Set<BigKey> = [startKey]
            var frontier = [st[i]]
            var bestJ = i + 1
            var bestKey: BigKey?
            var dd = 0
            while dd < depth && !frontier.isEmpty {
                var next: [[BigPiece]] = []
                for cur in frontier {
                    let ck = BigBoard.stateKey(cur)
                    for (move, state) in BigBoard.expand(cur, size) {
                        let k = BigBoard.stateKey(state)
                        if seen.contains(k) { continue }
                        seen.insert(k)
                        parent[k] = Par(from: ck, move: move, state: state)
                        if let j = idx[k], j > bestJ { bestJ = j; bestKey = k }
                        next.append(state)
                    }
                }
                frontier = next
                dd += 1
            }
            if let bk = bestKey {
                var chain: [(BigMove, [BigPiece])] = []
                var k = bk
                while k != startKey {
                    let e = parent[k]!
                    chain.append((e.move, e.state))
                    k = e.from
                }
                for c in chain.reversed() { outMoves.append(c.0); outStates.append(c.1) }
                i = bestJ
            } else {
                outStates.append(st[i + 1])
                outMoves.append(mv[i])
                i += 1
            }
        }
        let improved = outMoves.count < mv.count
        st = outStates
        mv = outMoves
        if !improved { break }
    }
    return (st, mv)
}

private func reverseMoves(_ moves: [BigMove]) -> [BigMove] { moves.map { BigMove(id: $0.id, dir: $0.dir.opposite) }.reversed() }

private func moveBetween(_ a: [BigPiece], _ b: [BigPiece], size: Int) -> BigMove? {
    let kb = BigBoard.stateKey(b)
    for e in BigBoard.expand(a, size) where BigBoard.stateKey(e.state) == kb { return e.move }
    return nil
}

private func tryGenerate(_ o: BigGenerateOptions, deadline: Date?) -> BigPuzzle? {
    let variant = o.variant
    let level = bigLevelFor(o.difficulty, size: o.size, variant: variant)
    let classic = variant == .classic
    let attempts = classic ? (level.exact ? 12 : 8) : (level.exact ? 40 : 12)
    let budget = classic ? Int.max : maxBallNodes
    for attempt in 0..<attempts {
        if !classic, attempt > 0, let dl = deadline, Date() > dl { break }
        let rng = rngFromString("\(bigGeneratorVersion)|\(o.seed)|\(o.size)|\(o.difficulty.rawValue)|\(attempt)\(classic ? "" : "|\(variant.rawValue)")")
        guard let goal = try? bigMakeGoal(rng, size: o.size, variant: variant) else { return nil }
        let ids = bigIds(goal)
        let ball: BigBall = level.exact
            ? bigBuildBall(goal, size: o.size, radius: level.radius, maxNodes: budget)
            : BigBall(nodes: [:], order: [], layers: [], radius: 0)
        func make(_ initial: [BigPiece], _ solution: [BigMove]) -> BigPuzzle? {
            if !meetsLevel(initial, goal, solution, level) { return nil }
            let p = BigPuzzle(id: o.id, mode: o.mode, difficulty: o.difficulty, size: o.size, variant: variant, number: o.number, goal: goal, initial: initial, solution: solution, generatorVersion: bigGeneratorVersion)
            return validateBigPuzzle(p) ? p : nil
        }
        if !level.exact {
            for _ in 0..<3 {
                let n = (classic ? 5 : 6 + (o.size - 4) * 2) + randInt(rng, 3)
                let states = Array(bigChain(rng, goal: goal, size: o.size, bigMoves: n, radius: classic ? 7 : 5).reversed())
                var raw: [BigMove] = []
                var ok = true
                for i in 0..<(states.count - 1) {
                    guard let m = moveBetween(states[i], states[i + 1], size: o.size) else { ok = false; break }
                    raw.append(m)
                }
                if !ok { continue }
                let (st, moves) = bigShortenPath(states, raw, size: o.size)
                if let p = make(st[0], moves) { return p }
            }
        } else if o.difficulty == .easy {
            let hi = min(level.maxLen, ball.radius)
            var keys: [BigKey] = []
            if level.minLen <= hi {
                keys = ball.layers[level.minLen...hi].flatMap { $0 }.filter { countBig(bigPathOut(ball, $0), ids) >= level.minBigMoves }
            }
            var t = 0
            while t < 30 && !keys.isEmpty {
                let k = keys[randInt(rng, keys.count)]
                if let p = make(ball.nodes[k]!.state, reverseMoves(bigPathOut(ball, k))) { return p }
                t += 1
            }
        } else {
            var deepest = ball.radius
            while deepest > 0 && ball.layers[deepest].isEmpty { deepest -= 1 }
            let far = ball.layers[deepest].filter { countBig(bigPathOut(ball, $0), ids) >= level.minBigMoves }
            let top = min(level.maxLen, 2 * ball.radius)
            if top < level.minLen { continue }
            var t = 0
            while t < 8 && !far.isEmpty {
                t += 1
                var cur = ball.nodes[far[randInt(rng, far.count)]]!.state
                var last: BigMove?
                let base = level.minLen - deepest
                let extra = base + randInt(rng, max(1, top - level.minLen - base + 2))
                var i = 0
                while i < extra {
                    i += 1
                    let opts = BigBoard.legalMoves(cur, o.size).filter { m in
                        !ids.contains(m.id) && !(last != nil && m.id == last!.id && m.dir == last!.dir.opposite)
                    }
                    if opts.isEmpty { break }
                    let m = opts[randInt(rng, opts.count)]
                    cur = BigBoard.movePiece(cur, o.size, m.id, m.dir)!
                    last = m
                }
                if let sol = bigOptimalSolution(cur, size: o.size, goalBall: ball, radius: ball.radius), let p = make(cur, sol) { return p }
            }
        }
    }
    return nil
}

/// Generates a puzzle; in the (very unlikely) case a level cannot be met, falls back to the next easier one.
/// `timeBudget` limits the search on non-classic boards (as the web does); tests pass false for determinism.
public func generateBigPuzzle(_ o: BigGenerateOptions, timeBudget: Bool = true) throws -> BigPuzzle {
    let order: [BigDifficulty] = o.difficulty == .hard ? [.hard, .normal, .easy] : o.difficulty == .normal ? [.normal, .easy] : [.easy]
    let classic = o.variant == .classic
    for difficulty in order {
        var deadline: Date?
        if timeBudget && !classic && difficulty != .easy { deadline = Date().addingTimeInterval(difficulty == .hard ? 0.7 : 0.5) }
        var oo = o
        oo.difficulty = difficulty
        if let p = tryGenerate(oo, deadline: deadline) { return p }
    }
    throw BigError.generationFailed
}

public func generateBigDaily(_ dateKey: String, timeBudget: Bool = true) throws -> BigPuzzle {
    try generateBigPuzzle(BigGenerateOptions(seed: "daily|\(dateKey)", id: "bigdaily-\(dateKey)", mode: .daily, difficulty: .normal, size: 4, number: DateKeys.dailyNumber(dateKey)), timeBudget: timeBudget)
}

public func generateBigEndless(size: Int, difficulty: BigDifficulty, seed: String = "\(Int(Date().timeIntervalSince1970 * 1000))-\(Double.random(in: 0..<1))", variant: BigVariant = .classic, timeBudget: Bool = true) throws -> BigPuzzle {
    try generateBigPuzzle(BigGenerateOptions(seed: "endless|\(seed)", id: "bigendless-\(seed)", mode: .endless, difficulty: difficulty, size: size, variant: variant), timeBudget: timeBudget)
}
