import SwiftUI
import SlideCore

enum ArtRoute: Hashable {
    case daily, resume, gallery, stats, how, credits, photos
    case play(String)
}

/// ART SLIDE: the app's home and its navigation. Owns the NavigationStack.
public struct ArtRootView: View {
    @Environment(AppModel.self) private var app
    @State private var store = ArtStore()
    @State private var photos = CustomPhotoStore()
    @State private var path: [ArtRoute] = ArtRootView.debugRoute()
    @State private var showSettings = ArtRootView.debugSettings()
    @State private var showPremium = false
    @State private var showMenu = ArtRootView.debugMenu()
    @State private var pending: ArtMenuAction?
    @State private var cover: Puzzle?
    enum Puzzle: String, Identifiable { case word, big; var id: String { rawValue } }

    public init() {}

    public var body: some View {
        NavigationStack(path: $path) {
            home
                .artScreen()
                .navigationDestination(for: ArtRoute.self) { route in
                    switch route {
                    case .daily: ArtPlayHost(kind: .daily, onGallery: { path = [.gallery] })
                    case .resume: ArtPlayHost(kind: .resume, onGallery: { path = [.gallery] })
                    case .play(let id): ArtPlayHost(kind: .painting(id), onGallery: { path = [.gallery] })
                    case .gallery: ArtGalleryView(path: $path)
                    case .stats: ArtStatsView()
                    case .how: ArtHowView()
                    case .credits: ArtCreditsView()
                    case .photos: ArtPhotosView(path: $path)
                    }
                }
        }
        .environment(store)
        .environment(photos)
        .tint(Web.fg)
        .sheet(isPresented: $showSettings) { SettingsView() }
        .sheet(isPresented: $showPremium) { PremiumView() }
        .sheet(isPresented: $showMenu, onDismiss: runPending) { ArtMenuSheet(choose: perform) }
        .fullScreenCover(item: $cover) { c in
            switch c { case .word: WordRootView(); case .big: BigRootView() }
        }
    }

    // MARK: home
    private var today: String { DateKeys.jstDateKey() }
    private var exhibit: Artwork? { ArtDaily.artworkID(today, pools: app.catalog.dailyPools).flatMap { app.catalog.artwork($0) } ?? app.catalog.artworks.first }

    private var home: some View {
        ScrollView {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Spacer()
                    topButton(app.t("home.other"), "ellipsis") { showMenu = true }
                    topButton(app.t("home.settings"), "gearshape") { showSettings = true }
                }
                Text("ART SLIDE")
                    .font(Web.font(40, .light, relativeTo: .largeTitle)).tracking(13).padding(.leading, 13)
                    .lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Web.fg)
                    .frame(maxWidth: .infinity).padding(.top, 14).padding(.bottom, 28)
                    .accessibilityAddTraits(.isHeader)
                if let a = exhibit { exhibitCard(a) }
                menu
                AdBannerSlot().padding(.top, 16)
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
            .frame(maxWidth: 520).frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    /// Icon-only round button of the home's top row (the name is kept for VoiceOver).
    private func topButton(_ title: String, _ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 17, weight: .regular))
                .foregroundStyle(Web.fg).frame(width: 44, height: 44)
                .overlay(Circle().stroke(Web.line, lineWidth: 1)).contentShape(Circle())
        }
        .accessibilityLabel(title)
    }

    private func exhibitCard(_ a: Artwork) -> some View {
        let done = store.save.dailyHistory[today]?.artworkId == a.id
        let streak = ArtStats.currentDailyStreak(store.save.dailyHistory, today: today)
        return Button { path.append(.daily) } label: {
            HStack(spacing: 18) {
                Group {
                    if let t = app.images.thumbnail(a.id) { Image(uiImage: t).resizable().scaledToFill() } else { Web.surface }
                }
                .frame(width: 112, height: 124).clipped().background(Web.surface)
                VStack(alignment: .leading, spacing: 8) {
                    Text(app.t("art.exhibitN", ["n": DateKeys.dailyNumber(today)]) + (done ? " ✓" : "") + (streak > 0 ? " · " + app.t("home.streak", ["n": streak]) : ""))
                        .font(Web.font(10, .semibold, relativeTo: .caption2)).tracking(2).foregroundStyle(Web.muted).fixedSize(horizontal: false, vertical: true)
                    Text(a.title).font(Web.font(19, .medium, relativeTo: .headline)).foregroundStyle(Web.fg).multilineTextAlignment(.leading).lineLimit(4)
                    Text("\(a.artist), \(a.year)").font(Web.font(11, relativeTo: .caption2)).foregroundStyle(Web.muted).multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12)
            .overlay(Rectangle().stroke(Web.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.bottom, 14)
        .accessibilityElement(children: .combine)
        .accessibilityHint(app.t("art.exhibit"))
    }

    private var menu: some View {
        let resumable = store.save.inProgressFree.map { $0.status == .playing } ?? false
        return VStack(spacing: 10) {
            HStack(spacing: 10) {
                Button(app.t("art.gallery")) { path.append(.gallery) }.buttonStyle(WebButtonStyle(minHeight: 66))
                Button(app.t("art.random")) { path.append(.play(randomArtwork())) }.buttonStyle(WebButtonStyle(minHeight: 66))
            }
            if resumable { Button(app.t("art.resume")) { path.append(.resume) }.buttonStyle(WebButtonStyle(minHeight: 48)) }
        }
        .multilineTextAlignment(.center)
        .padding(.bottom, 22)
    }

    private func randomArtwork() -> String {
        let pool = app.catalog.artworks.filter { !ArtRules.isArtworkLocked($0.id, premium: app.isPremium, catalog: app.catalog) }
        return (pool.randomElement() ?? app.catalog.artworks[0]).id
    }

    private func perform(_ a: ArtMenuAction) {
        pending = a
        showMenu = false
    }
    private func runPending() {
        guard let a = pending else { return }
        pending = nil
        switch a {
        case .route(let r): path.append(r)
        case .premium: showPremium = true
        case .settings: showSettings = true
        case .word: cover = .word
        case .big: cover = .big
        }
    }

    static func debugSettings() -> Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("-openSettings")
        #else
        return false
        #endif
    }

    static func debugMenu() -> Bool {
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments
        if let i = a.firstIndex(of: "-artScreen"), i + 1 < a.count, a[i + 1] == "menu" { return true }
        #endif
        return false
    }

    // DEBUG only: `-artScreen home|menu|daily|gallery|play:<id>|stats|how|credits|photos` opens a screen at launch (for screenshots).
    static func debugRoute() -> [ArtRoute] {
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: "-artScreen"), i + 1 < a.count else { return [] }
        let v = a[i + 1]
        switch v {
        case "daily": return [.daily]
        case "gallery": return [.gallery]
        case "stats": return [.stats]
        case "how": return [.how]
        case "credits": return [.credits]
        case "photos": return [.photos]
        default: if v.hasPrefix("play:") { return [.play(String(v.dropFirst(5)))] }
        }
        #endif
        return []
    }
}

