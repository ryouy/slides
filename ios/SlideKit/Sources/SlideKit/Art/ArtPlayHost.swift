import SwiftUI
import SlideCore

/// Opens a puzzle: today's exhibit, a chosen painting, the unfinished free puzzle, or one of the visitor's photos.
/// Looks after resuming, the Premium locks and getting the picture onto the screen (download screen for Premium paintings).
struct ArtPlayHost: View {
    enum Kind: Hashable { case daily, painting(String), resume }

    @Environment(AppModel.self) private var app
    @Environment(ArtStore.self) private var store
    @Environment(CustomPhotoStore.self) private var photos
    @Environment(\.dismiss) private var dismiss

    let kind: Kind
    var onGallery: () -> Void = {}

    enum Phase { case loading, locked, missing, download, ready, empty }
    @State private var phase = Phase.loading
    @State private var art: PlayArtwork?
    @State private var model: ArtGameModel?
    @State private var started = false
    @State private var sessionKey = UUID()

    var body: some View {
        Group {
            switch phase {
            case .ready:
                if let art, let model { ArtGameView(artwork: art, model: model, onLevel: { next(art, level: $0) }, onNext: { nextArtwork(from: art) }, onMore: { dismiss(); onGallery() }).id(sessionKey) }
            case .download:
                if let art { ArtDownloadView(artwork: art) { phase = .loading; Task { await open() } } }
            case .locked:
                LockedView(art: art, reasonKey: art?.isCustom == true ? "premium.lockedPhotos" : "premium.lockedArt")
            case .missing:
                messageScreen(app.t("photos.missing"))
            case .empty:
                messageScreen(app.t("ios.art.nothing"), button: (app.t("art.gallery"), { dismiss(); onGallery() }))
            case .loading:
                VStack { ArtTopBar(""); Spacer(); ProgressView(); Spacer() }.artScreen()
            }
        }
        .task { if !started { started = true; await open() } }
    }

    private func messageScreen(_ text: String, button: (String, () -> Void)? = nil) -> some View {
        VStack(spacing: 18) {
            ArtTopBar("ART SLIDE")
            Spacer()
            Text(text).font(Web.font(15)).foregroundStyle(Web.muted).multilineTextAlignment(.center).padding(.horizontal, 32)
            if let button { Button(button.0, action: button.1).buttonStyle(WebButtonStyle(filled: true)).padding(.horizontal, 32) }
            Spacer()
        }.artScreen()
    }

    // MARK: resolving
    private func open() async {
        let premium = app.isPremium
        switch kind {
        case .daily:
            let today = DateKeys.jstDateKey()
            guard let id = ArtDaily.artworkID(today, pools: app.catalog.dailyPools), let a = app.catalog.artwork(id) else { phase = .empty; return }
            let pa = PlayArtwork(a)
            var st: ArtState
            if let s = store.save.inProgressDaily, s.puzzle.id == "artdaily-\(today)", s.puzzle.artworkId == id, s.puzzle.generatorVersion == artGeneratorVersion { st = s }
            else { st = ArtState(puzzle: ArtGenerator.generateDaily(dateKey: today, artworkId: id, aspect: pa.aspect)); store.setProgress(daily: true, st) }
            await show(pa, st, daily: true)
        case .painting(let id):
            await openFree(id: id, premium: premium)
        case .resume:
            guard let s = store.save.inProgressFree else { phase = .empty; return }
            await openFree(id: s.puzzle.artworkId, premium: premium)
        }
    }

    private func playArtwork(_ id: String) -> PlayArtwork? {
        if ArtRules.isCustom(id) { return photos.photo(artworkID: id).map(PlayArtwork.init) }
        return app.catalog.artwork(id).map(PlayArtwork.init)
    }

    private func openFree(id: String, premium: Bool) async {
        if ArtRules.isCustom(id) {
            guard premium else { art = photos.photo(artworkID: id).map(PlayArtwork.init); phase = .locked; return }
            guard let pa = playArtwork(id) else { phase = .missing; return }
            await startOrResume(pa, premium: premium)
            return
        }
        guard let pa = playArtwork(id) else { phase = .empty; return }
        art = pa
        if ArtRules.isArtworkLocked(id, premium: premium, catalog: app.catalog) { phase = .locked; return }
        await startOrResume(pa, premium: premium)
    }

    private func startOrResume(_ pa: PlayArtwork, premium: Bool) async {
        if let s = store.save.inProgressFree, s.puzzle.artworkId == pa.id, !ArtRules.isLevelLocked(s.puzzle.size, premium: premium) {
            await show(pa, s, daily: false); return
        }
        let last = store.save.lastSize
        let lvl = premium ? last : min(last, ArtRules.freeMaxLevel)
        let st = ArtState(puzzle: ArtGenerator.generateFree(artworkId: pa.id, size: lvl, aspect: pa.aspect))
        store.setProgress(daily: false, st)
        await show(pa, st, daily: false)
    }

    private func image(for a: PlayArtwork) -> UIImage? {
        a.isCustom ? photos.photo(artworkID: a.id).flatMap { photos.image($0) } : app.images.fullImage(a.id)
    }

    private func show(_ pa: PlayArtwork, _ st: ArtState, daily: Bool) async {
        art = pa
        guard let img = image(for: pa) else {
            // not on the device: only a paying visitor gets here (locked paintings were handled before)
            phase = pa.isCustom ? .missing : .download
            return
        }
        let m = ArtGameModel(state: st, image: img, daily: daily)
        m.onProgress = { [store] s in store.setProgress(daily: daily, s) }
        m.onCleared = { [store] s in store.recordClear(s, dateKey: DateKeys.jstDateKey()) }
        model = m
        sessionKey = UUID()
        phase = .ready
    }

    // MARK: level / next painting
    private func next(_ pa: PlayArtwork, level: Int) {
        guard !ArtRules.isLevelLocked(level, premium: app.isPremium) else { return }
        store.update { $0.lastSize = level }
        let st = ArtState(puzzle: ArtGenerator.generateFree(artworkId: pa.id, size: level, aspect: pa.aspect))
        store.setProgress(daily: false, st)
        Task { await show(pa, st, daily: false) }
    }

    private func nextArtwork(from pa: PlayArtwork) {
        if pa.isCustom { dismiss(); return }
        guard let n = ArtGallery.nextPlayable(after: pa.id, in: app.catalog.artworks, premium: app.isPremium, catalog: app.catalog) else { return }
        let level = model?.state.puzzle.size ?? store.save.lastSize
        let npa = PlayArtwork(n)
        let st = ArtState(puzzle: ArtGenerator.generateFree(artworkId: n.id, size: level, aspect: npa.aspect))
        store.setProgress(daily: false, st)
        Task { await show(npa, st, daily: false) }
    }
}

/// A Free visitor reached a Premium painting or photo (also the fallback if a locked item is opened by a saved link).
private struct LockedView: View {
    @Environment(AppModel.self) private var app
    @State private var showPremium = false
    let art: PlayArtwork?
    let reasonKey: String
    var body: some View {
        VStack(spacing: 0) {
            ArtTopBar(art?.title ?? "ART SLIDE")
            Spacer()
            VStack(spacing: 16) {
                Image(systemName: "lock.fill").font(.system(size: 34, weight: .light)).foregroundStyle(Web.fg)
                Text(app.t(reasonKey)).font(Web.font(15)).multilineTextAlignment(.center).foregroundStyle(Web.fg)
                Button(app.t("premium.subscribe")) { showPremium = true }.buttonStyle(WebButtonStyle(filled: true, minHeight: 50))
            }.padding(.horizontal, 32)
            Spacer()
        }
        .artScreen()
        .sheet(isPresented: $showPremium) { PremiumView() }
    }
}

/// A Premium painting that is not on the device yet: one download (progress, retry, offline hint), then it plays offline.
struct ArtDownloadView: View {
    @Environment(AppModel.self) private var app
    let artwork: PlayArtwork
    var onDone: () -> Void
    enum S: Equatable { case idle, busy(Double), failed(String) }
    @State private var s = S.idle

    var body: some View {
        VStack(spacing: 0) {
            ArtTopBar(artwork.title)
            Spacer()
            VStack(spacing: 18) {
                if let t = app.images.thumbnail(artwork.id) {
                    Image(uiImage: t).resizable().scaledToFit().frame(maxHeight: 220).opacity(0.9)
                }
                Text(artwork.title).font(Web.font(17, .semibold)).multilineTextAlignment(.center).foregroundStyle(Web.fg)
                Text(app.t("ios.dl.needed")).font(Web.font(14)).foregroundStyle(Web.muted).multilineTextAlignment(.center)
                switch s {
                case .idle:
                    if app.network.isOnline { Button(app.t("ios.dl.start")) { Task { await go() } }.buttonStyle(WebButtonStyle(filled: true, minHeight: 50)) }
                    else { Text(app.t("ios.dl.offline")).font(Web.font(14)).foregroundStyle(Web.fg).multilineTextAlignment(.center)
                        Button(app.t("ios.dl.retry")) { Task { await go() } }.buttonStyle(WebButtonStyle(minHeight: 50)) }
                case .busy(let p):
                    ProgressView(value: p).tint(Web.fg).padding(.horizontal, 20)
                    Text("\(Int(p * 100))%").font(Web.font(13)).monospacedDigit().foregroundStyle(Web.muted)
                case .failed(let m):
                    Text(m).font(Web.font(14)).foregroundStyle(Web.fg).multilineTextAlignment(.center)
                    Button(app.t("ios.dl.retry")) { Task { await go() } }.buttonStyle(WebButtonStyle(filled: true, minHeight: 50))
                }
            }
            .padding(.horizontal, 32)
            Spacer()
        }
        .artScreen()
        .task { if app.network.isOnline, case .idle = s { await go() } }
    }

    private func go() async {
        s = .busy(0)
        do {
            try await app.images.download(artwork.id, premium: app.premium) { p in s = .busy(p) }
            onDone()
        } catch let e as ImageStore.DownloadError {
            switch e {
            case .offline: s = .failed(app.t("ios.dl.offline"))
            case .notPremium: s = .failed(app.t("ios.dl.premiumOnly"))
            default: s = .failed(app.t("ios.dl.failed"))
            }
        } catch { s = .failed(app.t("ios.dl.failed")) }
    }
}
