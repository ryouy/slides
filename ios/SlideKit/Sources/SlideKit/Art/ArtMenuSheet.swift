import SwiftUI

enum ArtMenuAction: Hashable {
    case route(ArtRoute), premium, settings, word, big
}

/// The home's menu (the "…" button): how to play, stats, credits, photos and the other puzzles. Terms, privacy, contact and Premium live in Settings only.
struct ArtMenuSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    var choose: (ArtMenuAction) -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    row(app.t("home.howTo"), "questionmark.circle") { pick(.route(.how)) }
                    row(app.t("home.stats"), "chart.bar") { pick(.route(.stats)) }
                    row(app.t("home.credits"), "text.book.closed") { pick(.route(.credits)) }
                    row(app.t("home.photos"), "photo.on.rectangle.angled", lock: !app.isPremium) { pick(.route(.photos)) }
                }
                Section(app.t("home.more")) {
                    row("BIG SLIDE", "square.grid.3x3.fill") { pick(.big) }
                    row("WORD SLIDE", "textformat.abc") { pick(.word) }
                }
            }
            .navigationTitle(app.t("home.other"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(app.t("common.close")) { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func pick(_ a: ArtMenuAction) { Haptics.tap(); choose(a) }

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
