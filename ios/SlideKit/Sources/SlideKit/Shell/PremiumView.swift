import SwiftUI

/// The Premium offer (also shown when a locked painting or board size is tapped). Price comes from the App Store, never from the source.
public struct PremiumView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var message: String?
    private let site = "https://slides.ryouy.workers.dev"

    public init() {}

    public var body: some View {
        let p = app.premium
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    Image(systemName: "sparkles").font(.system(size: 44)).foregroundStyle(.tint).padding(.top, 8)
                    Text("Premium").font(.largeTitle.bold())
                    VStack(alignment: .leading, spacing: 14) {
                        feature("photo.stack", app.t("premium.f1", ["n": app.catalog.artworks.filter { !app.catalog.isFree($0.id) }.count]))
                        feature("square.grid.3x3", app.t("premium.f2"))
                        feature("nosign", app.t("premium.f3"))
                        feature("photo.badge.plus", app.t("premium.f4"))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(app.t("premium.free")).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)

                    if app.isPremium {
                        VStack(spacing: 6) {
                            Label(app.t("ios.premium.active"), systemImage: "checkmark.seal.fill").font(.headline).foregroundStyle(.tint)
                            if let d = p.expiresAt {
                                let date = d.formatted(date: .abbreviated, time: .omitted)
                                Text(p.willRenew == false ? app.t("ios.premium.endsOn", ["date": date]) : app.t("ios.premium.renewsOn", ["date": date])).foregroundStyle(.secondary)
                            }
                            if p.inGrace { Text(app.t("ios.premium.grace")).foregroundStyle(.orange).multilineTextAlignment(.center) }
                        }
                        Button(app.t("ios.premium.manage")) { Task { await p.manageSubscription() } }.secondaryButton()
                    } else {
                        Text(p.displayPrice.map { app.t("ios.premium.perMonth", ["price": $0]) } ?? app.t("ios.premium.priceUnknown")).font(.title2.bold())
                        Text(app.t("ios.premium.autoRenew")).font(.footnote).foregroundStyle(.secondary)
                        Button { Task { await buy() } } label: { Text(app.t("ios.premium.subscribe")).frame(maxWidth: .infinity) }
                            .primaryButton().disabled(busy || p.productFound == false)
                    }
                    Button(app.t("ios.premium.restore")) { Task { await restore() } }.disabled(busy)
                    if let message { Text(message).font(.footnote).multilineTextAlignment(.center).accessibilityIdentifier("premium-message") }
                    HStack(spacing: 16) {
                        Link(app.t("ios.terms"), destination: URL(string: "\(site)/terms")!)
                        Link(app.t("ios.eula"), destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
                        Link(app.t("ios.privacy"), destination: URL(string: "\(site)/privacy")!)
                    }.font(.footnote)
                }
                .padding(24)
            }
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(app.t("common.close")) { dismiss() } } }
            .task { await p.refresh() }
        }
    }

    private func feature(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: 14) { Image(systemName: symbol).frame(width: 28).foregroundStyle(.tint); Text(text) }
    }

    private func buy() async {
        busy = true; defer { busy = false }
        switch await app.premium.purchase() {
        case .success: await app.account.claim(app.premium.signedTransaction); message = nil
        case .cancelled: message = app.t("ios.premium.cancelled")
        case .pending: message = app.t("ios.premium.pending")
        case .unavailable: message = app.t("ios.premium.unavailable")
        case .failed: message = app.t("ios.premium.failed")
        }
    }
    private func restore() async {
        busy = true; defer { busy = false }
        let ok = await app.premium.restore()
        if ok { await app.account.claim(app.premium.signedTransaction) }
        message = ok ? app.t("ios.premium.restored") : app.t("ios.premium.restoreFailed")
    }
}
