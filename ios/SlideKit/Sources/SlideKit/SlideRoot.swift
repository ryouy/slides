import SwiftUI
import SlideCore

/// The whole app. The Xcode app target only calls `SlideRoot()`.
public struct SlideRoot: View {
    @State private var app = AppModel()
    @State private var tab = SlideRoot.initialTab
    public init() {}

    public var body: some View {
        TabView(selection: $tab) {
            ArtRootView().tabItem { Label(app.t("ios.tab.art"), systemImage: "photo.artframe") }.tag(0)
            WordRootView().tabItem { Label(app.t("ios.tab.word"), systemImage: "textformat.abc") }.tag(1)
            BigRootView().tabItem { Label(app.t("ios.tab.big"), systemImage: "square.grid.3x3.fill") }.tag(2)
            SettingsView().tabItem { Label(app.t("ios.tab.settings"), systemImage: "gearshape") }.tag(3)
        }
        .environment(app)
        .preferredColorScheme(app.preferredScheme)
        .task { await app.start() }
    }

    /// DEBUG builds only: `-tab art|word|big|settings` opens that tab at launch (for screenshots and tests).
    static var initialTab: Int {
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments
        if let i = a.firstIndex(of: "-tab"), i + 1 < a.count, let n = ["art": 0, "word": 1, "big": 2, "settings": 3][a[i + 1]] { return n }
        #endif
        return 0
    }
}
