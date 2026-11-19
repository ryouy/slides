import Foundation

/// Port of src/utils/rng.ts. Must give the SAME numbers as the TypeScript version for the same seed (daily puzzles are
/// reproducible across the web and the app, and across app versions). Covered by golden-vector tests.
public typealias Rng = () -> Double

public func hashSeed(_ str: String) -> UInt32 {
    let units = Array(str.utf16) // JS charCodeAt / length count UTF-16 code units
    var h: UInt32 = 1779033703 ^ UInt32(truncatingIfNeeded: units.count)
    for u in units {
        h = (h ^ UInt32(u)) &* 3432918353
        h = (h << 13) | (h >> 19)
    }
    h = (h ^ (h >> 16)) &* 2246822507
    h = (h ^ (h >> 13)) &* 3266489909
    h ^= h >> 16
    return h
}

public func mulberry32(_ seed: UInt32) -> Rng {
    var a = seed
    return {
        a = a &+ 0x6d2b79f5
        var t = a
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4294967296.0
    }
}

public func rngFromString(_ seed: String) -> Rng { mulberry32(hashSeed(seed)) }

public func randInt(_ rng: Rng, _ n: Int) -> Int { Int((rng() * Double(n)).rounded(.down)) }

public func pick<T>(_ rng: Rng, _ arr: [T]) -> T { arr[randInt(rng, arr.count)] }

public func shuffled<T>(_ rng: Rng, _ arr: [T]) -> [T] {
    var a = arr
    var i = a.count - 1
    while i > 0 {
        let j = randInt(rng, i + 1)
        a.swapAt(i, j)
        i -= 1
    }
    return a
}
