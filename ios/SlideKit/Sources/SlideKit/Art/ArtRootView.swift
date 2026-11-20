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
                .background(Web.bg.ignoresSafeArea())
                .toolbarBackground(.hidden, for: .navigationBar)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button { showMenu = true } label: { Image(systemName: "ellipsis") }
                            .accessibilityLabel(app.t("home.other"))
                        Button { showSettings = true } label: { Image(systemName: "gearshape") }
                            .accessibilityLabel(app.t("home.settings"))
                    }
                }
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
        #if DEBUG
        .onAppear {
            // DEBUG only: `-forceLandscape` rotates the app at launch (for screenshots)
            if ProcessInfo.processInfo.arguments.contains("-forceLandscape"),
               let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
                scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight))
            }
        }
        #endif
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

    /// Three layouts, one idea: a title, today's exhibit, the ways in. Portrait is a column (bigger on iPad, centred, never a thin strip in a
    /// big window); landscape is two columns that fit the screen without scrolling (like the web's wide layout).
    private var home: some View {
        GeometryReader { geo in
            if geo.size.width > geo.size.height * 1.15 { wideHome(geo.size) } else { tallHome(geo.size) }
        }
    }

    private func titleView(_ size: CGFloat, k: CGFloat) -> some View {
        Text("ART SLIDE")
            .font(Web.font(size, .light, relativeTo: .largeTitle)).tracking(size * 0.32).padding(.leading, size * 0.32)
            .lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Web.fg)
            .frame(maxWidth: .infinity)
            .accessibilityAddTraits(.isHeader)
    }

    private func tallHome(_ size: CGSize) -> some View {
        let k = min(max(size.width / 390, 1), 1.7)   // 1 on an iPhone, up to 1.7 on an iPad
        return ScrollView {
            VStack(spacing: 0) {
                titleView(40 * k, k: k).padding(.top, 6 * k).padding(.bottom, 26 * k)
                if let a = exhibit {
                    // iPad: a big picture instead of a small thumbnail beside the text, so the page is not mostly empty
                    if k > 1.2 { exhibitCard(a, k: k, mode: .tall, imageHeight: size.height * 0.36).padding(.bottom, 16 * k) }
                    else { exhibitCard(a, k: k, mode: .row) }
                }
                menu(k: k, vertical: false, fill: false)
                AdBannerSlot().padding(.top, 16)
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
            .frame(maxWidth: min(size.width, 520 * k), minHeight: k > 1.2 ? size.height : nil, alignment: k > 1.2 ? .center : .top)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private func wideHome(_ size: CGSize) -> some View {
        let roomy = size.height > 520                                   // iPad (or a big window): a tall card; iPhone landscape: a compact one
        let k = roomy ? min(max(min(size.width / 760, size.height / 560), 1), 1.8) : 1
        let showAd = size.height > 600
        return VStack(spacing: roomy ? 18 * k : 8) {
            titleView(roomy ? 40 * k : 26, k: k).padding(.top, roomy ? 4 : 0)
            HStack(alignment: .top, spacing: 16 * k) {
                if let a = exhibit { exhibitCard(a, k: k, mode: roomy ? .tall : .compact) }
                menu(k: k, vertical: roomy, fill: roomy).frame(width: roomy ? min(size.width * 0.38, 380 * k) : min(size.width * 0.42, 320))
            }
            .frame(maxHeight: .infinity)
            if showAd { AdBannerSlot() }
        }
        .padding(.horizontal, 20).padding(.top, 2).padding(.bottom, roomy ? 16 : 6)
        .frame(maxWidth: min(size.width, 1100 * max(k, 1)), maxHeight: .infinity)
        .frame(maxWidth: .infinity)
    }

    enum CardMode { case row, compact, tall }

    private func exhibitCard(_ a: Artwork, k: CGFloat, mode: CardMode, imageHeight: CGFloat? = nil) -> some View {
        let done = store.save.dailyHistory[today]?.artworkId == a.id
        let streak = ArtStats.currentDailyStreak(store.save.dailyHistory, today: today)
        let line = app.t("art.exhibitN", ["n": DateKeys.dailyNumber(today)]) + (done ? " ✓" : "") + (streak > 0 ? " · " + app.t("home.streak", ["n": streak]) : "")
        let thumb = Group {
            if let t = app.images.thumbnail(a.id) { Image(uiImage: t).resizable().scaledToFill() } else { Web.surface }
        }
        let texts = VStack(alignment: .leading, spacing: 8 * k) {
            Text(line).font(Web.font(10 * k, .semibold, relativeTo: .caption2)).tracking(2).foregroundStyle(Web.muted).fixedSize(horizontal: false, vertical: true)
            Text(a.title).font(Web.font((mode == .compact ? 16 : 19) * k, .medium, relativeTo: .headline)).foregroundStyle(Web.fg).multilineTextAlignment(.leading).lineLimit(mode == .compact ? 3 : 4)
            Text("\(a.artist), \(a.year)").font(Web.font(11 * k, relativeTo: .caption2)).foregroundStyle(Web.muted).multilineTextAlignment(.leading)
        }
        return Button { path.append(.daily) } label: {
            Group {
                switch mode {
                case .row, .compact:
                    let w: CGFloat = (mode == .compact ? 84 : 112) * k, h: CGFloat = (mode == .compact ? 96 : 124) * k
                    HStack(spacing: 18 * k) {
                        thumb.frame(width: w, height: h).clipped().background(Web.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        texts.frame(maxWidth: .infinity, alignment: .leading)
                    }
                case .tall:
                    VStack(alignment: .leading, spacing: 14 * k) {
                        thumb.frame(maxWidth: .infinity, minHeight: imageHeight, maxHeight: imageHeight ?? .infinity).clipped().background(Web.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        texts.frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(12 * (mode == .tall ? 1.2 : k))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Web.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.bottom, mode == .row ? 14 * k : 0)
        .accessibilityElement(children: .combine)
        .accessibilityHint(app.t("art.exhibit"))
    }

    /// The ways in: Gallery and Random are the two big tiles; My Photos and Resume sit quietly side by side underneath.
    /// `vertical`: the two big tiles one above the other (a narrow column); `fill`: they share the column's height.
    private func menu(k: CGFloat, vertical: Bool, fill: Bool) -> some View {
        let resumable = store.save.inProgressFree.map { $0.status == .playing } ?? false
        let tile: (String, CGFloat) -> AnyView = { title, minH in
            AnyView(Text(title).font(Web.font(15 * k, .medium, relativeTo: .body)).lineLimit(1).minimumScaleFactor(0.7)
                .foregroundStyle(Web.fg).frame(maxWidth: .infinity, minHeight: minH, maxHeight: fill ? .infinity : minH))
        }
        let minH = (vertical ? 64 : 76) * k
        return VStack(spacing: 10 * k) {
            if vertical {
                VStack(spacing: 10 * k) {
                    Button { path.append(.gallery) } label: { tile(app.t("art.gallery"), minH) }.buttonStyle(HomeTileStyle())
                    Button { path.append(.play(randomArtwork())) } label: { tile(app.t("art.random"), minH) }.buttonStyle(HomeTileStyle())
                }.frame(maxHeight: fill ? .infinity : nil)
            } else {
                HStack(spacing: 10 * k) {
                    Button { path.append(.gallery) } label: { tile(app.t("art.gallery"), minH) }.buttonStyle(HomeTileStyle())
                    Button { path.append(.play(randomArtwork())) } label: { tile(app.t("art.random"), minH) }.buttonStyle(HomeTileStyle())
                }
            }
            HStack(spacing: 0) {
                if resumable {
                    Button { path.append(.resume) } label: {
                        HStack(spacing: 4) { Text(app.t("art.resume")); Image(systemName: "chevron.right").font(.system(size: 11 * k, weight: .semibold)) }
                            .frame(maxWidth: .infinity, minHeight: 44 * k)
                    }
                    .buttonStyle(.plain)
                }
                Button {
                    if app.isPremium { path.append(.photos) } else { showPremium = true }
                } label: {
                    HStack(spacing: 5) {
                        Text(app.t("home.photos"))
                        if !app.isPremium { Image(systemName: "lock.fill").font(.system(size: 11 * k)) }
                    }
                    .frame(maxWidth: .infinity, minHeight: 44 * k)
                }
                .buttonStyle(.plain)
                .accessibilityHint(app.isPremium ? app.t("photos.empty") : app.t("premium.lockedPhotos"))
            }
            .font(Web.font(14 * k, .medium, relativeTo: .subheadline)).foregroundStyle(Web.muted)
        }
        .multilineTextAlignment(.center)
        .padding(.bottom, vertical ? 0 : 22 * k)
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


/// The home's two big tiles: a rounded outline that dips a little when pressed.
struct HomeTileStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Web.line, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
