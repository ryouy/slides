import SwiftUI
import SlideCore

public enum ThemePref: String, Codable, CaseIterable, Sendable { case system, light, dark }

struct AppSettings: Codable {
    var lang: Lang?
    var theme: ThemePref = .system
    var colorblind = false
}

/// App-wide state shared by every screen: language, appearance, plan, services. Injected with `.environment(app)`.
@MainActor @Observable
public final class AppModel {
    public var lang: Lang { didSet { persist() } }
    public var theme: ThemePref { didSet { persist() } }
    public var colorblind: Bool { didSet { persist() } }

    public let strings: Strings
    public let catalog: ArtCatalog
    public let premium: PremiumStore
    public let ads: AdsManager
    public let images: ImageStore
    public let network: Reachability
    public let account: AccountStore
    public let sync: SyncStore
    public let googleAccount: GoogleAccountStore
    public let drive: DriveSyncStore

    private let store = JSONFileStore<AppSettings>(name: "settings")

    public var isPremium: Bool { premium.isPremium || account.remotePremium }
    public var preferredScheme: ColorScheme? { theme == .system ? nil : (theme == .dark ? .dark : .light) }

    public init() {
        let pub = AppPaths.publicURL
        strings = (try? Strings(url: pub.appendingPathComponent("data/strings.json"))) ?? Strings(dicts: [:])
        catalog = (try? ArtCatalog(url: pub.appendingPathComponent("data/artworks.json"))) ?? ArtCatalog(artworks: [], free: [], dailyPools: [])
        let s = store.load() ?? AppSettings()
        lang = s.lang ?? Lang.detect()
        theme = s.theme
        colorblind = s.colorblind
        premium = PremiumStore()
        ads = AdsManager()
        images = ImageStore(catalog: catalog)
        let net = Reachability(), acct = AccountStore()
        network = net; account = acct
        sync = SyncStore(account: acct, network: net)
        let g = GoogleAccountStore()
        googleAccount = g
        drive = DriveSyncStore(account: g, network: net)
        g.onIdentityToken = { [weak acct] token in
            Task { @MainActor in
                guard let acct else { return }
                // A pre-existing Apple session is never linked implicitly: the
                // Settings button makes that consequential action explicit.
                if !acct.isSignedIn { await acct.signInGoogle(idToken: token) }
            }
        }
    }

    private func persist() { store.save(AppSettings(lang: lang, theme: theme, colorblind: colorblind)) }

    /// Translate a UI text key (same keys as the web app's dictionaries).
    public func t(_ key: String, _ vars: [String: CustomStringConvertible] = [:]) -> String { strings.t(key, lang, vars) }

    /// Called once at launch.
    public func start() async {
        sync.start()
        drive.start()
        await premium.start()
        await account.claim(premium.signedTransaction)
        await images.refresh()
        await ads.prepare()
    }
}

public enum AppPaths {
    /// The folder of generated data and paintings bundled into the app (ios/App/App/public).
    public static var publicURL: URL { Bundle.main.bundleURL.appendingPathComponent("public", isDirectory: true) }
}
