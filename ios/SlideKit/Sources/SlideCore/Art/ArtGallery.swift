import Foundation

/// Port of gallery.ts + the free/Premium rules of premium/entitlement.ts (the app always has gating on).
public enum GroupBy: String, Codable, CaseIterable, Sendable { case none, era, theme }
public enum SortBy: String, Codable, Sendable { case artist, title, yearAsc = "year-asc", yearDesc = "year-desc", random }

public struct ArtGroup: Sendable { public let key: String; public let label: String; public let items: [Artwork] }

public enum ArtRules {
    /// Free plays up to board level 5; Premium also gets levels 6 and 7.
    public static let freeMaxLevel = 5
    public static func isLevelLocked(_ level: Int, premium: Bool) -> Bool { !premium && level > freeMaxLevel }
    public static func isArtworkLocked(_ id: String, premium: Bool, catalog: ArtCatalog) -> Bool { !premium && !catalog.isFree(id) }
    public static func isCustom(_ id: String) -> Bool { id.hasPrefix("custom:") }
}

public enum ArtGallery {
    public static let eraOrder = ["Before 1700", "1700s", "1800–1849", "1850–1879", "1880–1899", "1900s"]
    public static let themeOrder = ["Landscape", "Sea & Water", "City & Street", "People & Daily Life", "Portrait", "Still Life & Flowers", "Myth & Religion", "Japanese Prints"]
    /// 0 = automatic.
    public static let columnOptions = [0, 1, 2, 3, 4, 5, 6]

    static func fold(_ s: String) -> String { s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil) }

    /// Case- and accent-insensitive match on title, artist, theme, era, year and medium; every word must match.
    public static func filter(_ list: [Artwork], query: String) -> [Artwork] {
        let words = fold(query).split(whereSeparator: { $0.isWhitespace }).map(String.init)
        if words.isEmpty { return list }
        return list.filter { a in
            let hay = fold("\(a.title) \(a.artist) \(a.theme) \(a.era) \(a.year) \(a.medium)")
            return words.allSatisfy { hay.contains($0) }
        }
    }

    static let enLocale = Locale(identifier: "en")
    /// localeCompare('en', {sensitivity:'base'}) sign.
    static func byText(_ x: String, _ y: String) -> Int {
        switch x.compare(y, options: [.caseInsensitive, .diacriticInsensitive], range: nil, locale: enLocale) {
        case .orderedAscending: return -1
        case .orderedDescending: return 1
        case .orderedSame: return 0
        }
    }

    /// Stable per-seed pseudo-random order, so changing filters never unexpectedly reshuffles.
    public static func randomRank(_ id: String, seed: UInt32) -> UInt32 {
        var h: UInt32 = 2166136261 ^ seed
        for u in id.utf16 { h = (h ^ UInt32(u)) &* 16777619 }
        h ^= h >> 16
        h = h &* 0x7feb352d
        h ^= h >> 15
        h = h &* 0x846ca68b
        return h ^ (h >> 16)
    }

    public static func sort(_ list: [Artwork], by sortBy: SortBy, randomSeed: UInt32 = 0) -> [Artwork] {
        func lt(_ a: Artwork, _ b: Artwork) -> Bool {
            func chain(_ cs: [Int]) -> Bool { for c in cs where c != 0 { return c < 0 }; return false }
            func ci(_ a: Int, _ b: Int) -> Int { a < b ? -1 : (a > b ? 1 : 0) }
            switch sortBy {
            case .artist: return chain([byText(a.artistSort, b.artistSort), ci(a.yearStart, b.yearStart), byText(a.title, b.title)])
            case .title: return chain([byText(a.title, b.title), byText(a.artistSort, b.artistSort)])
            case .yearAsc: return chain([ci(a.yearStart, b.yearStart), byText(a.artistSort, b.artistSort), byText(a.title, b.title)])
            case .yearDesc: return chain([ci(b.yearStart, a.yearStart), byText(a.artistSort, b.artistSort), byText(a.title, b.title)])
            case .random:
                let x = randomRank(a.id, seed: randomSeed), y = randomRank(b.id, seed: randomSeed)
                return chain([x < y ? -1 : (x > y ? 1 : 0), byText(a.id, b.id)])
            }
        }
        // stable merge-style sort (JS sort is stable): index breaks remaining ties
        return list.enumerated().sorted { l, r in lt(l.element, r.element) ? true : (lt(r.element, l.element) ? false : l.offset < r.offset) }.map(\.element)
    }

    /// Groups (already filtered) artworks; within every group the paintings the visitor can play come first, the Premium-locked ones last.
    public static func group(_ list: [Artwork], by groupBy: GroupBy, sortBy: SortBy, randomSeed: UInt32 = 0, isLocked: (Artwork) -> Bool = { _ in false }) -> [ArtGroup] {
        let sortedAll = sort(list, by: sortBy, randomSeed: randomSeed)
        let sorted = sortedAll.filter { !isLocked($0) } + sortedAll.filter(isLocked)
        if groupBy == .none { return sorted.isEmpty ? [] : [ArtGroup(key: "all", label: "", items: sorted)] }
        var map: [String: [Artwork]] = [:]
        var firstSeen: [String] = []
        for a in sorted {
            let k = groupBy == .era ? a.era : a.theme
            if map[k] == nil { firstSeen.append(k) }
            map[k, default: []].append(a)
        }
        let order = groupBy == .era ? eraOrder : themeOrder
        func rank(_ k: String) -> Int { (order.firstIndex(of: k).map { $0 + 1 }) ?? 99 }
        let keys = firstSeen.sorted { x, y in
            let rx = rank(x), ry = rank(y)
            if rx != ry { return rx < ry }
            return byText(x, y) < 0
        }
        return keys.map { ArtGroup(key: $0, label: $0, items: map[$0]!) }
    }

    /// A few paintings for the home page: the same for everyone on a given day, each by a different artist.
    public static func homePicks(_ pool: [Artwork], dateKey: String, count: Int = 6) -> [Artwork] {
        let rng = rngFromString("home-picks|\(dateKey)")
        var order = pool.sorted { $0.id.utf16.lexicographicallyPrecedes($1.id.utf16) }
        var i = order.count - 1
        while i > 0 {
            let j = Int((rng() * Double(i + 1)).rounded(.down))
            order.swapAt(i, j)
            i -= 1
        }
        var seen = Set<String>(), out: [Artwork] = []
        for a in order where !seen.contains(a.artist) {
            seen.insert(a.artist); out.append(a)
            if out.count == count { break }
        }
        return out
    }

    /// The next painting for "Next artwork": the one after `id` among those the visitor can play (wraps around).
    public static func nextPlayable(after id: String, in all: [Artwork], premium: Bool, catalog: ArtCatalog) -> Artwork? {
        let pool = all.filter { !ArtRules.isArtworkLocked($0.id, premium: premium, catalog: catalog) }
        guard !pool.isEmpty else { return nil }
        guard let i = pool.firstIndex(where: { $0.id == id }) else { return pool.first }
        return pool[(i + 1) % pool.count]
    }
}

public enum ArtDaily {
    public static let algo = "ios1"

    public static func pool(for dateKey: String, pools: [IosDailyPool]) -> IosDailyPool? {
        var cur = pools.first
        for p in pools where dateKey >= p.from { cur = p }
        return cur
    }

    /// Port of dailyArtworkIdIos: every painting here is bundled, so the daily puzzle always works offline.
    public static func artworkID(_ dateKey: String, pools: [IosDailyPool]) -> String? {
        guard let pool = pool(for: dateKey, pools: pools), !pool.ids.isEmpty else { return nil }
        let n = pool.ids.count
        let idx = DateKeys.dailyNumber(dateKey) - DateKeys.dailyNumber(pool.from)
        let cycle = Int((Double(idx) / Double(n)).rounded(.down))
        let order = shuffled(rngFromString("art-daily|\(algo)|\(pool.from)|cycle\(cycle)"), pool.ids)
        return order[((idx % n) + n) % n]
    }
}
