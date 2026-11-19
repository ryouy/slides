import SwiftUI
import SlideCore
import GoogleSignIn

/// The whole app (ART SLIDE only). The Xcode app target only calls `SlideRoot()`.
/// Settings and Premium are opened as sheets from the home screen (`SettingsView()`, `PremiumView()`).
public struct SlideRoot: View {
    @State private var app = AppModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var splash = !ProcessInfo.processInfo.arguments.contains("-artScreen") && !ProcessInfo.processInfo.arguments.contains("-openSettings")
    public init() {}

    public var body: some View {
        ZStack {
            ArtRootView()
            if splash { SplashView { splash = false }.transition(.identity).zIndex(1) }
        }
            .environment(app)
            .preferredColorScheme(app.preferredScheme)
            .task { await app.start() }
            .onChange(of: scenePhase) { _, p in if p == .active { Task { await app.account.refreshStatus() } } }
            .onOpenURL { _ = GIDSignIn.sharedInstance.handle($0) } // Google sign-in redirect
    }
}
