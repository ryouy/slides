import SwiftUI
import SlideCore

/// The gallery: search, group by theme/era, columns, random order, group tabs and the painting grid. Premium paintings are shown locked and listed last.
struct ArtGalleryView: View {
    @Environment(AppModel.self) private var app
    @Environment(ArtStore.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize
    @Binding var path: [ArtRoute]

    @State private var query = ""
    @State private var selected = ""
    @State private var showPremium = false
    @FocusState private var searchFocus: Bool

    private var prefs: ArtGalleryPrefs { store.save.gallery }
    private var filtered: [Artwork] { ArtGallery.filter(app.catalog.artworks, query: query) }
    private var groups: [ArtGroup] {
        ArtGallery.group(filtered, by: prefs.groupBy, sortBy: prefs.randomized ? .random : .artist, randomSeed: prefs.randomSeed,
                         isLocked: { ArtRules.isArtworkLocked($0.id, premium: app.isPremium, catalog: app.catalog) })
    }
    private var columns: Int { prefs.columns == 0 ? (hSize == .regular ? 3 : 2) : prefs.columns }

    var body: some View {
        let groups = self.groups
        let active = groups.first { $0.key == selected } ?? groups.first
        VStack(spacing: 0) {
            ArtTopBar(app.t("gal.title"))
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
                    controls.padding(.top, 8)
                    if filtered.count != app.catalog.artworks.count {
                        Text(app.t("gal.filtered", ["n": filtered.count, "total": app.catalog.artworks.count])).font(Web.font(12)).foregroundStyle(Web.muted).padding(.bottom, 8)
                    }
                    if prefs.groupBy != .none && !groups.isEmpty { tabs(groups, active: active) }
                    if let active {
                        grid(active.items).id("\(active.key)-\(prefs.randomSeed)-\(prefs.randomized)-\(columns)")
                    } else {
                        Text(app.t("gal.empty", ["q": query])).font(Web.font(14)).foregroundStyle(Web.muted).frame(maxWidth: .infinity).padding(.vertical, 40)
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            AdBannerSlot()
        }
        .artScreen()
        .sheet(isPresented: $showPremium) { PremiumView() }
    }

    // MARK: controls
    private var controls: some View {
        VStack(spacing: 9) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 14)).foregroundStyle(Web.muted)
                TextField(app.t("gal.search"), text: $query).focused($searchFocus).font(Web.font(15)).foregroundStyle(Web.fg)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.search)
                    .onChange(of: query) { _, _ in selected = "" }
                if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Web.muted).frame(width: 36, height: 36) }.accessibilityLabel(app.t("common.close")) }
            }
            .padding(.horizontal, 12).frame(minHeight: 44)
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Web.line, lineWidth: 1))
            HStack(alignment: .bottom, spacing: 9) {
                field(app.t("gal.groupBy")) {
                    Menu {
                        Picker(app.t("gal.groupBy"), selection: Binding(get: { prefs.groupBy }, set: { v in selected = ""; store.update { $0.gallery.groupBy = v } })) {
                            ForEach(GroupBy.allCases, id: \.self) { Text(app.t("group.\($0.rawValue)")).tag($0) }
                        }
                    } label: { trigger(app.t("group.\(prefs.groupBy.rawValue)")) }
                }
                field(app.t("gal.columns")) {
                    Menu {
                        Picker(app.t("gal.columns"), selection: Binding(get: { prefs.columns }, set: { v in store.update { $0.gallery.columns = v } })) {
                            ForEach(ArtGallery.columnOptions, id: \.self) { Text($0 == 0 ? app.t("gal.columnsAuto") : "\($0)").tag($0) }
                        }
                    } label: { trigger(prefs.columns == 0 ? app.t("gal.columnsAuto") : "\(prefs.columns)") }
                }
                Button { Haptics.tap(); selected = ""; store.update { $0.gallery.randomized = true; $0.gallery.randomSeed = UInt32.random(in: 0...UInt32.max) } } label: { Text(app.t("gal.randomize")).lineLimit(1).minimumScaleFactor(0.7) }
                    .buttonStyle(WebButtonStyle(minHeight: 40)).font(Web.font(12, .medium)).frame(width: 84)
            }
        }
        .padding(.bottom, 12)
    }
    private func field<C: View>(_ label: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 5) { Text(label).font(Web.font(10, .medium, relativeTo: .caption2)).tracking(0.7).foregroundStyle(Web.muted).lineLimit(1); c() }.frame(maxWidth: .infinity)
    }
    private func trigger(_ t: String) -> some View {
        HStack { Text(t).font(Web.font(12, .medium, relativeTo: .caption)).lineLimit(1); Spacer(minLength: 4); Image(systemName: "chevron.down").font(.system(size: 9)) }
            .foregroundStyle(Web.fg).padding(.horizontal, 9).frame(minHeight: 40).frame(maxWidth: .infinity)
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Web.line, lineWidth: 1))
    }

    private func label(_ key: String) -> String {
        switch prefs.groupBy { case .theme: app.t("theme.\(key)"); case .era: app.t("era.\(key)"); case .none: key }
    }

    private func tabs(_ groups: [ArtGroup], active: ArtGroup?) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 3) {
                    ForEach(groups, id: \.key) { g in
                        let on = g.key == active?.key
                        Button { withAnimation(.easeOut(duration: 0.18)) { selected = g.key } } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(label(g.key)).font(Web.font(12, .medium, relativeTo: .caption)); Text("\(g.items.count)").font(Web.font(10, relativeTo: .caption2))
                            }
                            .foregroundStyle(on ? Web.fg : Web.muted).padding(.horizontal, 12).frame(minHeight: 44)
                            .overlay(alignment: .bottom) { Rectangle().fill(on ? Web.fg : .clear).frame(height: 2) }
                        }
                        .id(g.key).accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
            }
            .overlay(alignment: .bottom) { Rectangle().fill(Web.line).frame(height: 1) }
            .onChange(of: active?.key) { _, k in if let k { withAnimation { proxy.scrollTo(k, anchor: .center) } } }
        }
        .padding(.top, 4).padding(.bottom, 16)
    }

    private func grid(_ items: [Artwork]) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: columns), spacing: 14) {
            ForEach(items) { a in card(a) }
        }
    }

    private func card(_ a: Artwork) -> some View {
        let locked = ArtRules.isArtworkLocked(a.id, premium: app.isPremium, catalog: app.catalog)
        return Button {
            if locked { Haptics.tap(); showPremium = true } else { path.append(.play(a.id)) }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                ZStack(alignment: .topTrailing) {
                    SquareThumb(image: app.images.thumbnail(a.id), dim: locked)
                    if locked {
                        Image(systemName: "lock.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(Web.fg)
                            .frame(width: 24, height: 24).background(Web.bg.opacity(0.82), in: Circle()).padding(6)
                    }
                }
                Text(a.title).font(Web.font(13, .semibold, relativeTo: .footnote)).foregroundStyle(Web.fg).lineLimit(2).multilineTextAlignment(.leading).padding(.top, 4)
                Text("\(a.artist) · \(a.year)").font(Web.font(11, relativeTo: .caption2)).foregroundStyle(Web.muted).lineLimit(1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(a.title), \(a.artist)" + (locked ? ", " + app.t("premium.lock") : ""))
    }
}
