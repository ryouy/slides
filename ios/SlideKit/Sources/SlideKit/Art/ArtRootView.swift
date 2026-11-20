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

    /// Three layouts, one idea: a title, today's exhibit, the ways in, and a row of paintings from the gallery.
    ///  - iPhone portrait: a column that scrolls (the gallery row slides sideways under the menu).
    ///  - iPhone landscape: two compact columns that fit the screen without scrolling.
    ///  - iPad: the web's wide layout: the exhibit on the left, the ways in as large lines on the right, six paintings underneath.
    private var home: some View {
        GeometryReader { geo in
            if geo.size.width >= 700 && geo.size.height >= 500 { desktopHome(geo.size) }
            else if geo.size.width > geo.size.height * 1.15 { wideHome(geo.size) }
            else { tallHome(geo.size) }
        }
    }

    private func titleView(_ size: CGFloat) -> some View {
        Text("ART SLIDE")
            .font(Web.font(size, .light, relativeTo: .largeTitle)).tracking(size * 0.32).padding(.leading, size * 0.32)
            .lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Web.fg)
            .frame(maxWidth: .infinity)
            .accessibilityAddTraits(.isHeader)
    }

    // MARK: iPhone, portrait
    private func tallHome(_ size: CGSize) -> some View {
        ScrollView {
            VStack(spacing: 0) {
                titleView(40).padding(.top, 6).padding(.bottom, 26)
                if let a = exhibit { exhibitCard(a, k: 1, mode: .row) }
                menu(vertical: false)
                galleryStrip(roomy: false, width: size.width).padding(.bottom, 8)
                AdBannerSlot().padding(.top, 8)
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
            .frame(maxWidth: min(size.width, 520))
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    // MARK: iPhone, landscape (no scrolling)
    private func wideHome(_ size: CGSize) -> some View {
        VStack(spacing: 8) {
            titleView(26)
            HStack(alignment: .top, spacing: 16) {
                if let a = exhibit { exhibitCard(a, k: 1, mode: .compact) }
                menu(vertical: false).frame(width: min(size.width * 0.42, 320))
            }
            .frame(maxHeight: .infinity)
        }
        .padding(.horizontal, 20).padding(.top, 2).padding(.bottom, 6)
        .frame(maxWidth: size.width, maxHeight: .infinity)
        .frame(maxWidth: .infinity)
    }

    // MARK: iPad: like the web on a wide screen
    private func desktopHome(_ size: CGSize) -> some View {
        let k = min(max(size.width / 760, 1), 1.5)
        let content = min(size.width, 1180) - 64
        let gap = 34 * k
        let leftW = (content - gap) * 1.3 / 2.3
        let pad = 16 * k
        let imgW = (leftW - 2 * pad - 28 * k) * 0.42
        let imgH = imgW * 1.25
        let cardH = imgH + 2 * pad
        return ScrollView {
            VStack(spacing: 0) {
                titleView(40 * k).padding(.top, 8).padding(.bottom, 24 * k)
                HStack(alignment: .top, spacing: gap) {
                    if let a = exhibit { deskExhibit(a, k: k, imgW: imgW, imgH: imgH, pad: pad).frame(width: leftW, height: cardH) }
                    deskMenu(k: k).frame(maxWidth: .infinity).frame(height: cardH)
                }
                galleryStrip(roomy: true, width: content).padding(.top, 36 * k)
                AdBannerSlot().padding(.top, 20)
            }
            .padding(.horizontal, 32).padding(.bottom, 28)
            .frame(maxWidth: min(size.width, 1180), minHeight: size.height, alignment: .center)   // centred when the page is shorter than the screen
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private var exhibitLine: String {
        let done = exhibit.map { store.save.dailyHistory[today]?.artworkId == $0.id } ?? false
        let streak = ArtStats.currentDailyStreak(store.save.dailyHistory, today: today)
        return app.t("art.exhibitN", ["n": DateKeys.dailyNumber(today)]) + (done ? " ✓" : "") + (streak > 0 ? " · " + app.t("home.streak", ["n": streak]) : "")
    }

    /// The web's wide exhibit card: the picture (4:5) on the left, the text beside it.
    private func deskExhibit(_ a: Artwork, k: CGFloat, imgW: CGFloat, imgH: CGFloat, pad: CGFloat) -> some View {
        Button { path.append(.daily) } label: {
            HStack(spacing: 28 * k) {
                Group {
                    if let t = app.images.thumbnail(a.id) { Image(uiImage: t).resizable().scaledToFill() } else { Web.surface }
                }
                .frame(width: imgW, height: imgH).clipped().background(Web.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 12 * k) {
                    Text(exhibitLine).font(Web.font(11 * k, .semibold, relativeTo: .caption2)).tracking(2).foregroundStyle(Web.muted).fixedSize(horizontal: false, vertical: true)
                    Text(a.title).font(Web.font(26 * k, .medium, relativeTo: .title)).foregroundStyle(Web.fg).multilineTextAlignment(.leading).lineLimit(3).minimumScaleFactor(0.8)
                    Text("\(a.artist), \(a.year)").font(Web.font(13 * k, relativeTo: .caption)).foregroundStyle(Web.muted).multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(pad)
            .frame(maxHeight: .infinity)
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Web.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(app.t("art.exhibit"))
    }

    /// The ways in as large lines between hairlines, a chevron at the right (the web's wide menu).
    private func deskMenu(k: CGFloat) -> some View {
        let resumable = store.save.inProgressFree.map { $0.status == .playing } ?? false
        func line(_ title: String, lock: Bool = false, small: Bool = false, chevron: Bool = true, action: @escaping () -> Void) -> some View {
            Button(action: action) {
                HStack(spacing: 10) {
                    Text(title).font(Web.font((small ? 18 : 24) * k, .medium, relativeTo: .title3)).foregroundStyle(small ? Web.muted : Web.fg).lineLimit(1).minimumScaleFactor(0.7)
                    if lock { Image(systemName: "lock.fill").font(.system(size: 13 * k)).foregroundStyle(Web.muted) }
                    Spacer(minLength: 8)
                    if chevron { Image(systemName: "chevron.right").font(.system(size: (small ? 14 : 18) * k, weight: .light)).foregroundStyle(Web.muted) }
                }
                .padding(.horizontal, small ? 14 * k : 4)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        let hair = Rectangle().fill(Web.line)
        return VStack(spacing: 0) {
            hair.frame(height: 1)
            line(app.t("art.gallery")) { path.append(.gallery) }
            hair.frame(height: 1)
            line(app.t("art.random")) { path.append(.play(randomArtwork())) }
            hair.frame(height: 1)
            // My Photos (left) and Resume (right) side by side, like the web; My Photos alone fills the row when there is nothing to resume
            HStack(spacing: 0) {
                line(app.t("home.photos"), lock: !app.isPremium, small: true) { if app.isPremium { path.append(.photos) } else { showPremium = true } }
                if resumable {
                    hair.frame(width: 1)
                    line(app.t("art.resume"), small: true) { path.append(.resume) }
                }
            }
            .frame(height: 76 * k)
            hair.frame(height: 1)
        }
    }

    // MARK: the gallery row (the web's "From the gallery")
    private var picks: [Artwork] {
        ArtGallery.homePicks(app.catalog.artworks.filter { !ArtRules.isArtworkLocked($0.id, premium: app.isPremium, catalog: app.catalog) }, dateKey: today)
    }

    /// Six paintings, the same for everybody on a given day (the web's pick): a row of six on iPad, a sideways row on iPhone.
    private func galleryStrip(roomy: Bool, width: CGFloat) -> some View {
        let items = picks
        return VStack(alignment: .leading, spacing: 12) {
            if roomy { Rectangle().fill(Web.line).frame(height: 1) }
            Text(app.t("home.fromGallery")).font(Web.font(11, .semibold, relativeTo: .caption2)).tracking(2.4).textCase(.uppercase).foregroundStyle(Web.muted)
                .padding(.top, roomy ? 10 : 18)
            if roomy {
                HStack(alignment: .top, spacing: 18) { ForEach(items) { pickCard($0) } }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) { ForEach(items) { pickCard($0).frame(width: 136) } }
                        .padding(.horizontal, 16)
                }
                .padding(.horizontal, -16)   // the row runs to the screen edges
            }
        }
    }

    private func pickCard(_ a: Artwork) -> some View {
        Button { path.append(.play(a.id)) } label: {
            VStack(alignment: .leading, spacing: 2) {
                Color.clear.aspectRatio(5.0 / 4.0, contentMode: .fit)
                    .overlay { if let t = app.images.thumbnail(a.id) { Image(uiImage: t).resizable().scaledToFill() } else { Web.surface } }
                    .background(Web.surface).clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text(a.title).font(Web.font(12, .semibold, relativeTo: .caption)).foregroundStyle(Web.fg).lineLimit(1).padding(.top, 6)
                Text(a.artist).font(Web.font(11, relativeTo: .caption2)).foregroundStyle(Web.muted).lineLimit(1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(a.title), \(a.artist)")
    }

    enum CardMode { case row, compact }

    private func exhibitCard(_ a: Artwork, k: CGFloat, mode: CardMode) -> some View {
        let thumb = Group {
            if let t = app.images.thumbnail(a.id) { Image(uiImage: t).resizable().scaledToFill() } else { Web.surface }
        }
        let texts = VStack(alignment: .leading, spacing: 8 * k) {
            Text(exhibitLine).font(Web.font(10 * k, .semibold, relativeTo: .caption2)).tracking(2).foregroundStyle(Web.muted).fixedSize(horizontal: false, vertical: true)
            Text(a.title).font(Web.font((mode == .compact ? 16 : 19) * k, .medium, relativeTo: .headline)).foregroundStyle(Web.fg).multilineTextAlignment(.leading).lineLimit(mode == .compact ? 3 : 4)
            Text("\(a.artist), \(a.year)").font(Web.font(11 * k, relativeTo: .caption2)).foregroundStyle(Web.muted).multilineTextAlignment(.leading)
        }
        let w: CGFloat = (mode == .compact ? 84 : 112) * k, h: CGFloat = (mode == .compact ? 96 : 124) * k
        return Button { path.append(.daily) } label: {
            HStack(spacing: 18 * k) {
                thumb.frame(width: w, height: h).clipped().background(Web.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                texts.frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12 * k)
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Web.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.bottom, mode == .row ? 14 : 0)
        .accessibilityElement(children: .combine)
        .accessibilityHint(app.t("art.exhibit"))
    }

    /// iPhone: Gallery and Random are the two big tiles; My Photos and Resume sit quietly side by side underneath.
    private func menu(vertical: Bool) -> some View {
        let resumable = store.save.inProgressFree.map { $0.status == .playing } ?? false
        func tile(_ title: String) -> some View {
            Text(title).font(Web.font(15, .medium, relativeTo: .body)).lineLimit(1).minimumScaleFactor(0.7)
                .foregroundStyle(Web.fg).frame(maxWidth: .infinity, minHeight: 76)
        }
        return VStack(spacing: 10) {
            HStack(spacing: 10) {
                Button { path.append(.gallery) } label: { tile(app.t("art.gallery")) }.buttonStyle(HomeTileStyle())
                Button { path.append(.play(randomArtwork())) } label: { tile(app.t("art.random")) }.buttonStyle(HomeTileStyle())
            }
            // My Photos (left) and Resume (right), side by side in quiet outlined boxes; My Photos alone fills the row when there is nothing to resume
            HStack(spacing: 10) {
                Button {
                    if app.isPremium { path.append(.photos) } else { showPremium = true }
                } label: {
                    HStack(spacing: 5) {
                        Text(app.t("home.photos"))
                        if !app.isPremium { Image(systemName: "lock.fill").font(.system(size: 11)) }
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(HomeTileStyle(radius: 16))
                .accessibilityHint(app.isPremium ? app.t("photos.empty") : app.t("premium.lockedPhotos"))
                if resumable {
                    Button { path.append(.resume) } label: {
                        HStack(spacing: 4) { Text(app.t("art.resume")); Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)) }
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(HomeTileStyle(radius: 16))
                }
            }
            .font(Web.font(14, .medium, relativeTo: .subheadline)).foregroundStyle(Web.muted)
        }
        .multilineTextAlignment(.center)
        .padding(.bottom, 14)
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
    var radius: CGFloat = 22
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Web.line, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
            .contentShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}
