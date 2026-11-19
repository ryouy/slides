import SwiftUI
import SlideCore
import GoogleSignIn

/// The whole app (ART SLIDE only). The Xcode app target only calls `SlideRoot()`.
/// Settings and Premium are opened as sheets from the home screen (`SettingsView()`, `PremiumView()`).
public struct SlideRoot: View {
    @State private var app = AppModel()
    public init() {}

    public var body: some View {
        ArtRootView()
            .environment(app)
            .preferredColorScheme(app.preferredScheme)
            .task { await app.start() }
            .onOpenURL { _ = GIDSignIn.sharedInstance.handle($0) } // Google sign-in redirect
    }
}
