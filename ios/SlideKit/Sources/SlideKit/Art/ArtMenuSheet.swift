import SwiftUI
import SafariServices

enum ArtMenuAction: Hashable {
    case route(ArtRoute), premium, settings, word, big
}

/// The home's menu (the "…" button): the web's "More" content as a native iOS grouped list, in the same style as Settings.
struct ArtMenuSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    var choose: (ArtMenuAction) -> Void
    @State private var web: WebPage?

    private static let site = "https://slides.ryouy.workers.dev"
    struct WebPage: Identifiable { let id = UUID(); let url: URL }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    row(app.t("home.howTo"), "questionmark.circle") { pick(.route(.how)) }
                    row(app.t("home.stats"), "chart.bar") { pick(.route(.stats)) }
                    row(app.t("home.credits"), "text.book.closed") { pick(.route(.credits)) }
                    row(app.t("home.photos"), "photo.on.rectangle.angled", lock: !app.isPremium) { pick(.route(.photos)) }
                    row("Premium", "sparkles") { pick(.premium) }
                }
                Section(app.t("home.more")) {
                    row("BIG SLIDE", "square.grid.3x3.fill") { pick(.big) }
                    row("WORD SLIDE", "textformat.abc") { pick(.word) }
                }
                Section {
                    row(app.t("common.about"), "info.circle", external: true) { open("about") }
                    row(app.t("common.privacy"), "hand.raised", external: true) { open("privacy") }
                    row(app.t("common.terms"), "doc.text", external: true) { open("terms") }
                    row(app.t("common.contact"), "envelope", external: true) { open("contact") }
                }
            }
            .navigationTitle(app.t("home.other"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(app.t("common.close")) { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sheet(item: $web) { w in SafariView(url: w.url).ignoresSafeArea() }
    }

    private func pick(_ a: ArtMenuAction) { Haptics.tap(); choose(a) }
    private func open(_ page: String) { if let u = URL(string: "\(Self.site)/\(page)") { web = WebPage(url: u) } }

    private func row(_ title: String, _ symbol: String, lock: Bool = false, external: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Label { Text(title).foregroundStyle(.primary) } icon: { Image(systemName: symbol).foregroundStyle(.tint) }
                if lock { Image(systemName: "lock.fill").font(.footnote).foregroundStyle(.secondary) }
                Spacer()
                Image(systemName: external ? "arrow.up.right" : "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// In-app Safari for the web pages (privacy policy, terms, contact, about).
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
