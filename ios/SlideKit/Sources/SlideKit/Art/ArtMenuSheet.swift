import SwiftUI
import SafariServices

enum ArtMenuAction: Hashable {
    case route(ArtRoute), premium, settings, word, big
}

/// The home's "Menu": the web's "More" list as a sheet (main links, puzzles, about links), plain rows with hairlines.
struct ArtMenuSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    var choose: (ArtMenuAction) -> Void
    @State private var web: WebPage?

    private static let site = "https://slides.ryouy.workers.dev"
    struct WebPage: Identifiable { let id = UUID(); let url: URL }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(app.t("home.other")).font(Web.font(14, .semibold, relativeTo: .subheadline)).tracking(2).foregroundStyle(Web.fg).accessibilityAddTraits(.isHeader)
                Spacer()
                Button(app.t("common.close")) { dismiss() }.font(Web.font(14, .medium)).foregroundStyle(Web.fg).frame(minHeight: 44)
            }
            .padding(.horizontal, 16).padding(.top, 6)
            .overlay(alignment: .bottom) { Rectangle().fill(Web.line).frame(height: 1) }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    section([
                        row(app.t("home.howTo")) { pick(.route(.how)) },
                        row(app.t("home.stats")) { pick(.route(.stats)) },
                        row(app.t("home.credits")) { pick(.route(.credits)) },
                        row(app.t("home.photos"), lock: !app.isPremium) { pick(.route(.photos)) },
                        row(app.t("home.premium")) { pick(.premium) },
                        row(app.t("home.settings")) { pick(.settings) },
                    ])
                    section([
                        row("BIG SLIDE", bold: true) { pick(.big) },
                        row("WORD SLIDE", bold: true) { pick(.word) },
                    ], heading: app.t("home.more"))
                    section([
                        row(app.t("common.about"), small: true, external: true) { open("about") },
                        row(app.t("common.privacy"), small: true, external: true) { open("privacy") },
                        row(app.t("common.terms"), small: true, external: true) { open("terms") },
                        row(app.t("common.contact"), small: true, external: true) { open("contact") },
                    ])
                }
                .padding(.horizontal, 16).padding(.bottom, 20).frame(maxWidth: 560).frame(maxWidth: .infinity)
            }
        }
        .background(Web.bg.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sheet(item: $web) { w in SafariView(url: w.url).ignoresSafeArea() }
    }

    private func pick(_ a: ArtMenuAction) { Haptics.tap(); choose(a) }
    private func open(_ page: String) { if let u = URL(string: "\(Self.site)/\(page)") { web = WebPage(url: u) } }

    private func section(_ rows: [AnyView], heading: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let heading { Text(heading).font(Web.font(11, .semibold, relativeTo: .caption2)).tracking(2).foregroundStyle(Web.muted).padding(.top, 18).padding(.bottom, 4) }
            ForEach(rows.indices, id: \.self) { rows[$0] }
        }
        .padding(.top, heading == nil ? 6 : 0)
    }

    private func row(_ title: String, lock: Bool = false, bold: Bool = false, small: Bool = false, external: Bool = false, action: @escaping () -> Void) -> AnyView {
        AnyView(
            Button(action: action) {
                HStack {
                    Text(title).font(Web.font(small ? 13 : 15, bold ? .semibold : .regular, relativeTo: .body)).tracking(bold ? 1.4 : 0)
                        .foregroundStyle(small ? Web.muted : Web.fg)
                    if lock { Image(systemName: "lock.fill").font(.system(size: 11)).foregroundStyle(Web.muted) }
                    Spacer()
                    Image(systemName: external ? "arrow.up.right" : "chevron.right").font(.system(size: 11)).foregroundStyle(Web.muted)
                }
                .frame(minHeight: 48).contentShape(Rectangle())
            }
            .overlay(alignment: .bottom) { Rectangle().fill(Web.line).frame(height: 1) }
        )
    }
}

/// In-app Safari for the web pages (privacy policy, terms, contact, about).
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
