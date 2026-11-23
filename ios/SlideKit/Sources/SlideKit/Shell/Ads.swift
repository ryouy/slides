import SwiftUI
import GoogleMobileAds
import UserMessagingPlatform
import AppTrackingTransparency

/// Google UMP consent, App Tracking Transparency and the AdMob SDK. The games work whatever is answered.
@MainActor @Observable
public final class AdsManager {
    public private(set) var canShowAds = false
    public private(set) var privacyOptionsRequired = false
    private var started = false

    static let bannerUnitID: String? = {
        (Bundle.main.object(forInfoDictionaryKey: "AdMobBannerUnitID") as? String).flatMap { $0.isEmpty || $0.hasPrefix("$(") ? nil : $0 }
    }()

    public init() {
        // consent given in an earlier session lets the SDK start at once, without waiting for the network
        refreshState()
    }

    func prepare() async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-skipConsent") { refreshState(); return } // DEBUG builds only: skip the UMP/ATT pop-ups for screenshots and UI tests
        #endif
        let vc = Self.topViewController()
        _ = try? await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
        if let vc { try? await ConsentForm.loadAndPresentIfRequired(from: vc) }
        // ATT: only when ads may be requested, only while the app is active (otherwise iOS silently ignores the request),
        // and the answer changes nothing in the app: no reward, no feature locked.
        if ConsentInformation.shared.canRequestAds, ATTrackingManager.trackingAuthorizationStatus == .notDetermined {
            for _ in 0..<20 where UIApplication.shared.applicationState != .active { try? await Task.sleep(nanoseconds: 250_000_000) }
            if UIApplication.shared.applicationState == .active { _ = await ATTrackingManager.requestTrackingAuthorization() }
        }
        refreshState()
    }

    private func refreshState() {
        privacyOptionsRequired = ConsentInformation.shared.privacyOptionsRequirementStatus == .required
        canShowAds = ConsentInformation.shared.canRequestAds && Self.bannerUnitID != nil
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-forceAds") { canShowAds = Self.bannerUnitID != nil }
        #endif
        if canShowAds, !started { started = true; MobileAds.shared.start(completionHandler: nil) }
    }

    public func showPrivacyOptions() async {
        if let vc = Self.topViewController() { try? await ConsentForm.presentPrivacyOptionsForm(from: vc) }
        refreshState()
    }

    static func topViewController() -> UIViewController? {
        var vc = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController
        while let p = vc?.presentedViewController { vc = p }
        return vc
    }
}

/// An adaptive AdMob banner that takes no room unless an ad really loaded: nothing for Premium, when ads are not allowed,
/// offline, or when loading fails. Put it only on calm screens (home, gallery, results), never next to a board in play.
public struct AdBannerSlot: View {
    @Environment(AppModel.self) private var app
    @State private var height: CGFloat = 0
    public init() {}
    public var body: some View {
        if app.premium.hasResolved && !app.isPremium && app.ads.canShowAds && app.network.isOnline {
            GeometryReader { geo in
                // The banner view must have its real size while it loads (a zero-height view makes the SDK fail with "Invalid ad width or height"):
                // it keeps the full ad size, and only the slot around it is collapsed (clipped) until an ad has arrived.
                let w = max(geo.size.width, 320)
                BannerRepresentable(width: w, height: $height)
                    .frame(width: w, height: largeAnchoredAdaptiveBanner(width: w).size.height)
                    .frame(width: geo.size.width, height: height, alignment: .top)
                    .clipped()
            }
            .frame(height: height)
            .accessibilityHidden(true)
        }
    }
}

private struct BannerRepresentable: UIViewRepresentable {
    let width: CGFloat
    @Binding var height: CGFloat

    func makeCoordinator() -> Coordinator { Coordinator(height: $height) }
    func makeUIView(context: Context) -> BannerView {
        let b = BannerView(adSize: largeAnchoredAdaptiveBanner(width: max(width, 320)))
        b.adUnitID = AdsManager.bannerUnitID
        b.rootViewController = AdsManager.topViewController()
        b.delegate = context.coordinator
        b.load(Request())
        return b
    }
    func updateUIView(_ uiView: BannerView, context: Context) {}

    final class Coordinator: NSObject, BannerViewDelegate {
        var height: Binding<CGFloat>
        init(height: Binding<CGFloat>) { self.height = height }
        func bannerViewDidReceiveAd(_ bannerView: BannerView) { height.wrappedValue = bannerView.adSize.size.height }
        func bannerView(_ bannerView: BannerView, didFailToReceiveAdWithError error: Error) { height.wrappedValue = 0 }
    }
}
