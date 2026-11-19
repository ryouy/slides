import Foundation

public enum Lang: String, CaseIterable, Codable, Identifiable, Sendable {
    case en, ja, zh, ko, es, fr, de
    public var id: String { rawValue }
    /// Written in each language itself, so everyone can find theirs.
    public var label: String {
        switch self {
        case .en: "English"; case .ja: "日本語"; case .zh: "中文（简体）"; case .ko: "한국어"
        case .es: "Español"; case .fr: "Français"; case .de: "Deutsch"
        }
    }
    /// The best supported language for the device's preferred languages (else English).
    public static func detect(_ preferred: [String] = Locale.preferredLanguages) -> Lang {
        for p in preferred {
            let code = String(p.lowercased().split(separator: "-").first ?? "")
            if let l = Lang(rawValue: code) { return l }
        }
        return .en
    }
}

/// UI text: the same dictionaries as the web app (exported by ios/scripts/export-data.ts to data/strings.json),
/// with English as the fallback and `{name}` placeholders.
public final class Strings: @unchecked Sendable {
    private let dicts: [String: [String: String]]
    public init(dicts: [String: [String: String]]) { self.dicts = dicts }

    public convenience init(url: URL) throws {
        let data = try Data(contentsOf: url)
        self.init(dicts: try JSONDecoder().decode([String: [String: String]].self, from: data))
    }

    public func t(_ key: String, _ lang: Lang, _ vars: [String: CustomStringConvertible] = [:]) -> String {
        var s = dicts[lang.rawValue]?[key] ?? dicts["en"]?[key] ?? key
        for (k, v) in vars { s = s.replacingOccurrences(of: "{\(k)}", with: String(describing: v)) }
        return s
    }
    public func has(_ key: String) -> Bool { dicts["en"]?[key] != nil }
}
