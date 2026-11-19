import Foundation

/// One painting (the same fields as the web's Artwork; exported by ios/scripts/export-data.ts).
public struct Artwork: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let artist: String
    public let year: String
    public let width: Int
    public let height: Int
    public let artistSort: String
    public let yearStart: Int
    public let yearEnd: Int
    public let era: String
    public let theme: String
    public let medium: String
    public let museum: String
    public let sourceUrl: String
    public let license: String
    public let licenseUrl: String
    public let licenseBasis: String
    public let sourceImageUrl: String
    public let verifiedAt: String
    /// Museum text (English) and optional translations keyed by language code (ja, zh, ko, es, fr, de).
    public let description: String
    public let descriptionTranslations: [String: String]?
    public let descriptionAttribution: String?
    public let descriptionSourceUrl: String?
    public let descriptionLicense: String?
    public let descriptionLicenseUrl: String?
    public let descriptionModifications: String?

    public func description(in lang: Lang) -> String { descriptionTranslations?[lang.rawValue] ?? description }
}

public struct IosDailyPool: Codable, Sendable { public let from: String; public let ids: [String] }

/// All registered paintings. The number of paintings is never hard-coded: it is whatever the data says.
public final class ArtCatalog: @unchecked Sendable {
    public let artworks: [Artwork]
    public let freeIDs: Set<String>
    public let dailyPools: [IosDailyPool]
    private let byID: [String: Artwork]

    private struct File: Codable { let free: [String]; let dailyPools: [IosDailyPool]; let artworks: [Artwork] }

    public init(artworks: [Artwork], free: [String], dailyPools: [IosDailyPool]) {
        self.artworks = artworks
        self.freeIDs = Set(free)
        self.dailyPools = dailyPools
        self.byID = Dictionary(artworks.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    }
    public convenience init(url: URL) throws {
        let f = try JSONDecoder().decode(File.self, from: Data(contentsOf: url))
        self.init(artworks: f.artworks, free: f.free, dailyPools: f.dailyPools)
    }
    public func artwork(_ id: String) -> Artwork? { byID[id] }
    public func isFree(_ id: String) -> Bool { freeIDs.contains(id) }
}
