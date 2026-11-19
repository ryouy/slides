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

    public init() {}

    func prepare() async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-skipConsent") { return } // DEBUG builds only: skip the UMP/ATT pop-ups for screenshots and UI tests
        #endif
        let vc = Self.topViewController()
        _ = try? await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
        if let vc { try? await ConsentForm.loadAndPresentIfRequired(from: vc) }
        if ConsentInformation.shared.canRequestAds, ATTrackingManager.trackingAuthorizationStatus == .notDetermined {
            _ = await ATTrackingManager.requestTrackingAuthorization()
        }
        refreshState()
    }

    private func refreshState() {
        privacyOptionsRequired = ConsentInformation.shared.privacyOptionsRequirementStatus == .required
        canShowAds = ConsentInformation.shared.canRequestAds && Self.bannerUnitID != nil
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
        if !app.isPremium && app.ads.canShowAds && app.network.isOnline {
            GeometryReader { geo in
                BannerRepresentable(width: geo.size.width, height: $height)
                    .frame(width: geo.size.width, height: height)
                    .frame(maxWidth: .infinity)
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
        let b = BannerView(adSize: currentOrientationAnchoredAdaptiveBanner(width: max(width, 320)))
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
