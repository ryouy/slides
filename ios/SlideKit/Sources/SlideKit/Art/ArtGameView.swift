import SwiftUI
import SlideCore

/// The play screen, laid out like the web's: caption bar with Time / Moves and Preview / Shuffle / Numbers, the board as large as
/// possible, then the description and credits. No ads here.
struct ArtGameView: View {
    @Environment(AppModel.self) private var app
    @Environment(ArtStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    let artwork: PlayArtwork
    let model: ArtGameModel
    var onLevel: (Int) -> Void = { _ in }
    var onNext: () -> Void = {}
    var onMore: () -> Void = {}

    @State private var showPreview = false
    @State private var pendingLevel: Int?
    @State private var showPremium = false
    @State private var shuffleHint = 0

    private var d: Dims { model.state.dims }

    var body: some View {
        GeometryReader { geo in
            // landscape (iPhone) and wide iPad windows: like the web's wide layout: one top bar (title on the left, time / moves and the
            // buttons on the right), the board under it taking all the rest
            if geo.size.width > geo.size.height * 1.15 {
                VStack(spacing: 0) {
                    wideHeader.padding(.horizontal, 12).padding(.top, 2)
                    ArtBoardView(model: model, aspect: artwork.aspect, showNumbers: store.save.showNumbers)
                        .padding(.horizontal, 16).padding(.vertical, 6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    if geo.size.height > 560 { extra.padding(.horizontal, 16).padding(.bottom, 8) }
                }
            } else {
                VStack(spacing: 0) {
                    header.padding(.horizontal, 12).padding(.top, 2).padding(.bottom, 4)
                    ArtBoardView(model: model, aspect: artwork.aspect, showNumbers: store.save.showNumbers)
                        .padding(.horizontal, 16).padding(.vertical, 6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    extra.padding(.horizontal, 16).padding(.bottom, 8)
                }
            }
        }
        .artScreen()
        .task { Haptics.prepare(); await model.prepare() }
        .task(id: model.state.started && !model.state.cleared) {
            // the timer starts at the first move; every tick adds the real time since the last one
            while !Task.isCancelled { model.tick(); try? await Task.sleep(for: .milliseconds(200)) }
        }
        .onChange(of: scenePhase) { _, p in
            model.paused = p != .active
            if p != .active { model.flush() }
        }
        .onDisappear { model.flush() }
        .sheet(isPresented: $showPreview) { ArtInfoSheet(artwork: artwork, image: model.image) }
        .sheet(isPresented: $showPremium) { PremiumView() }
        .sheet(isPresented: Binding(get: { model.showResult && model.state.cleared }, set: { model.showResult = $0 })) {
            ArtResultSheet(artwork: artwork, model: model, onNext: { model.showResult = false; daily ? onMore() : onNext() },
                           onAgain: { model.shuffle(reduceMotion: reduceMotion) }, onHome: { model.showResult = false; dismiss() })
                .presentationDetents([.large])
        }
        .confirmationDialog(pendingLevel.map { app.t("art.confirmLevel", ["grid": gridLabel($0)]) } ?? "", isPresented: Binding(get: { pendingLevel != nil }, set: { if !$0 { pendingLevel = nil } }), titleVisibility: .visible) {
            Button(app.t("art.start")) { if let l = pendingLevel { onLevel(l) }; pendingLevel = nil }
            Button(app.t("common.cancel"), role: .cancel) { pendingLevel = nil }
        }
    }

    private var daily: Bool { model.daily }

    // MARK: header
    private var header: some View {
        let titles = VStack(alignment: .leading, spacing: 2) {
            if daily { Text(app.t("art.dailyTitle", ["n": model.state.puzzle.number ?? 0])).font(Web.font(9, .semibold, relativeTo: .caption2)).tracking(2).foregroundStyle(Web.muted) }
            Text(artwork.title).font(Web.font(14, .semibold, relativeTo: .subheadline)).foregroundStyle(Web.fg).fixedSize(horizontal: false, vertical: true)
            if !artwork.isCustom { Text("\(artwork.artist), \(artwork.year)").font(Web.font(10, relativeTo: .caption2)).foregroundStyle(Web.muted).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        // simple header: back + title (full width), then Time / Moves on the left and three plain icons on the right, no boxes or outlines
        return VStack(spacing: 2) {
            HStack(alignment: .center, spacing: 6) {
                Button { dismiss() } label: { Image(systemName: "chevron.left").font(.system(size: 18)).foregroundStyle(Web.fg).frame(width: 36, height: 44).contentShape(Rectangle()) }
                    .accessibilityLabel(app.t("common.back"))
                titles
                starButton
            }
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 6) { stats; actions(star: false) }
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .center, spacing: 8) { stats; Spacer(minLength: 0); actions(star: false) }
                    VStack(alignment: .leading, spacing: 4) { stats; actions(star: false) }
                }
                .padding(.leading, 42) // under the title, past the back arrow
            }
        }
    }

    /// The top bar of wide windows: back + title (left), time / moves, piece count and the three icons (right), and the next painting on iPhone landscape
    private var wideHeader: some View {
        HStack(alignment: .center, spacing: 8) {
            Button { dismiss() } label: { Image(systemName: "chevron.left").font(.system(size: 18)).foregroundStyle(Web.fg).frame(width: 36, height: 44).contentShape(Rectangle()) }
                .accessibilityLabel(app.t("common.back"))
            VStack(alignment: .leading, spacing: 1) {
                if daily { Text(app.t("art.dailyTitle", ["n": model.state.puzzle.number ?? 0])).font(Web.font(9, .semibold, relativeTo: .caption2)).tracking(2).foregroundStyle(Web.muted) }
                Text(artwork.title).font(Web.font(14, .semibold, relativeTo: .subheadline)).foregroundStyle(Web.fg).lineLimit(1)
                if !artwork.isCustom { Text("\(artwork.artist), \(artwork.year)").font(Web.font(10, relativeTo: .caption2)).foregroundStyle(Web.muted).lineLimit(1) }
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 8)
            stats
            actions()
            if !daily {
                Button { onNext() } label: { Image(systemName: "forward.end").font(.system(size: 17)).foregroundStyle(Web.fg).frame(width: 44, height: 44).contentShape(Rectangle()) }
                    .accessibilityLabel(app.t(artwork.isCustom ? "photos.title" : "art.nextArtwork"))
            }
        }
    }

    private var stats: some View {
        HStack(alignment: .bottom, spacing: 4) {
            stat(app.t("common.time"), ArtStats.formatTime(model.clockMs), width: 64)
            stat(app.t("common.moves"), "\(model.movesShown)", width: 48)
        }
        .accessibilityElement(children: .combine)
    }
    /// A fixed-width column with the label centred and the number centred right under it, so the digits never push the column sideways.
    private func stat(_ label: String, _ value: String, width: CGFloat) -> some View {
        VStack(alignment: .center, spacing: 0) {
            Text(label).font(Web.font(9, .semibold, relativeTo: .caption2)).tracking(1.4).foregroundStyle(Web.muted).lineLimit(1)
            Text(value).font(Web.font(22, .light, relativeTo: .title3)).monospacedDigit().foregroundStyle(Web.fg).minimumScaleFactor(0.6).lineLimit(1)
        }
        .frame(width: width)
    }

    private func actions(star: Bool = true) -> some View {
        HStack(spacing: 2) {
            if !daily { levelMenu }
            if star { starButton }
            icon("info.circle", app.t("art.preview")) { showPreview = true }
            icon("shuffle", app.t("art.shuffle")) { model.shuffle(reduceMotion: reduceMotion) }.disabled(model.shuffling).opacity(model.shuffling ? 0.45 : 1)
            let on = store.save.showNumbers
            Button { Haptics.tap(); store.update { $0.showNumbers.toggle() } } label: {
                Image(systemName: "number").font(.system(size: 18, weight: on ? .semibold : .regular))
                    .foregroundStyle(on ? Web.bg : Web.fg).frame(width: 36, height: 36)
                    .background(on ? Web.fg : Color.clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .frame(width: 44, height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(app.t("art.numbers")).accessibilityAddTraits(on ? .isSelected : [])
        }
    }
    /// The favourite toggle (not for the visitor's own photos).
    @ViewBuilder private var starButton: some View {
        if !artwork.isCustom {
            let fav = store.isFavorite(artwork.id)
            icon(fav ? "star.fill" : "star", app.t(fav ? "ios.fav.remove" : "ios.fav.add")) { store.toggleFavorite(artwork.id) }
                .accessibilityAddTraits(fav ? .isSelected : [])
        }
    }
    /// Piece count (grid) chooser: just "4×3", no level names. Premium sizes show a lock.
    private var levelMenu: some View {
        Menu {
            ForEach(artLevels, id: \.self) { l in
                Button { choose(l) } label: {
                    if ArtRules.isLevelLocked(l, premium: app.isPremium) { Label(gridLabel(l), systemImage: "lock.fill") }
                    else if l == model.state.puzzle.size { Label(gridLabel(l), systemImage: "checkmark") }
                    else { Text(gridLabel(l)) }
                }
            }
        } label: {
            HStack(spacing: 3) {
                Text(gridLabel(model.state.puzzle.size)).font(Web.font(15, .medium, relativeTo: .subheadline)).monospacedDigit()
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold))
            }
            .fixedSize().foregroundStyle(Web.fg).padding(.horizontal, 8).frame(minHeight: 44).contentShape(Rectangle())
        }
        .fixedSize()
        .disabled(model.shuffling)
        .accessibilityLabel(app.t("big.size"))
        .accessibilityValue(gridLabel(model.state.puzzle.size))
    }
    private func icon(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: { Haptics.tap(); action() }) {
            Image(systemName: symbol).font(.system(size: 19, weight: .regular)).foregroundStyle(Web.fg).frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    // MARK: below the board
    private var extra: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !daily && !artwork.isCustom {
                HStack {
                    Spacer()
                    Button { onNext() } label: {
                        HStack(spacing: 2) { Text(app.t(artwork.isCustom ? "photos.title" : "art.nextArtwork")); Image(systemName: "chevron.right").font(.system(size: 10)) }
                            .font(Web.font(12, relativeTo: .caption)).foregroundStyle(Web.muted).frame(minHeight: 38)
                    }
                }
            }
        }
    }
    @ViewBuilder private func creditLink(_ t: String, _ url: String?) -> some View {
        if let url, let u = URL(string: url) { Link(t, destination: u).underline().foregroundStyle(Web.muted) } else { Text(t) }
    }

    private func gridLabel(_ l: Int) -> String { let g = ArtGrid.gridFor(aspect: artwork.aspect, level: l); return "\(g.cols)×\(g.rows)" }

    private func choose(_ l: Int) {
        if ArtRules.isLevelLocked(l, premium: app.isPremium) { showPremium = true; return }
        if l == model.state.puzzle.size { return }
        if model.state.moves == 0 || model.state.cleared { onLevel(l) } else { pendingLevel = l }
    }
}

/// Preview of the finished painting with its description and credits (also reachable by tapping the description).
struct ArtInfoSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let artwork: PlayArtwork
    let image: UIImage
    var body: some View {
        VStack(spacing: 0) {
            HStack { Spacer(); Button(app.t("common.close")) { dismiss() }.font(Web.font(14, .medium)).foregroundStyle(Web.fg).frame(minHeight: 44) }.padding(.horizontal, 16)
            GeometryReader { geo in
                ScrollView {
                    if geo.size.width > 640 {
                        // iPad / wide window: the painting takes most of the width, the text sits beside it
                        HStack(alignment: .top, spacing: 28) {
                            picture.frame(width: geo.size.width * 0.6)
                            VStack(alignment: .leading, spacing: 12) { details }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(20)
                    } else {
                        VStack(alignment: .leading, spacing: 12) { picture; details }.padding(16)
                    }
                }
            }
        }
        .background(Web.bg.ignoresSafeArea())
        .presentationDetents([.large])
        .modifier(PageSizedSheet())
    }

    private var picture: some View {
        Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: .infinity)
            .accessibilityLabel(app.t("art.preview"))
    }

    @ViewBuilder private var details: some View {
        Text(artwork.title).font(Web.font(18, .semibold, relativeTo: .headline)).foregroundStyle(Web.fg)
        if !artwork.isCustom {
            Text("\(artwork.artist) · \(artwork.year)").font(Web.font(13)).foregroundStyle(Web.muted)
            if let a = artwork.artwork {
                Text(a.description(in: app.lang)).font(Web.font(15)).lineSpacing(4).foregroundStyle(Web.fg)
                HStack(spacing: 4) {
                    Text(a.museum); Text("·")
                    if let u = URL(string: a.licenseUrl) { Link("CC0", destination: u) }; Text("·")
                    if let u = URL(string: a.sourceUrl) { Link(app.t("art.source"), destination: u) }
                }.font(Web.font(12)).foregroundStyle(Web.muted)
                if let l = a.descriptionLicense ?? (a.descriptionLicenseUrl != nil ? "CC BY 4.0" : nil) {
                    Text("\(app.t("art.textSource")): \(a.descriptionAttribution ?? a.museum) · \(l)").font(Web.font(11)).foregroundStyle(Web.muted)
                }
            }
        }
    }
}

/// On iPad (iOS 18+) the sheet fills the window instead of the small form-sheet card.
private struct PageSizedSheet: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) { content.presentationSizing(.page) } else { content }
    }
}

/// COMPLETE! with time, moves, the painting and what to do next. A calm screen: the ad banner is allowed here.
struct ArtResultSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let artwork: PlayArtwork
    let model: ArtGameModel
    var onNext: () -> Void
    var onAgain: () -> Void
    var onHome: () -> Void

    var body: some View {
        let s = model.state
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 18) {
                    Text(app.t("art.complete")).font(Web.font(26, .light, relativeTo: .title)).tracking(7).foregroundStyle(Web.fg).padding(.top, 28).multilineTextAlignment(.center)
                    HStack(spacing: 0) {
                        resultStat(app.t("common.time"), ArtStats.formatTime(s.elapsedMs), best: model.outcome?.newBestTime == true && model.outcome?.firstClear == false)
                        Rectangle().fill(Web.line).frame(width: 1, height: 44)
                        resultStat(app.t("common.moves"), "\(s.moves)", best: model.outcome?.newBestMoves == true && model.outcome?.firstClear == false)
                    }
                    .overlay(alignment: .top) { Rectangle().fill(Web.line).frame(height: 1) }
                    .overlay(alignment: .bottom) { Rectangle().fill(Web.line).frame(height: 1) }
                    VStack(spacing: 6) {
                        Image(uiImage: model.image).resizable().scaledToFit().frame(maxHeight: 240)
                        Text(artwork.title).font(Web.font(15, .semibold)).foregroundStyle(Web.fg).multilineTextAlignment(.center)
                        if !artwork.isCustom { Text("\(artwork.artist) · \(artwork.year)").font(Web.font(12)).foregroundStyle(Web.muted) }
                    }
                    VStack(spacing: 10) {
                        Button { onNext() } label: { Text(app.t(model.daily ? "art.moreArtworks" : "art.nextArtwork")) }.buttonStyle(WebButtonStyle(filled: true, minHeight: 50))
                        if !model.daily { Button { onAgain() } label: { Text(app.t("art.playAgain")) }.buttonStyle(WebButtonStyle(minHeight: 50)) }
                        if !artwork.isCustom { ShareLink(item: shareText) { Text(app.t("share.share")) }.buttonStyle(WebButtonStyle(minHeight: 50)) }
                        Button { onHome() } label: { Text(app.t("art.backHome")) }.buttonStyle(WebButtonStyle(minHeight: 50))
                    }
                }
                .padding(.horizontal, 24).padding(.bottom, 16)
            }
            AdBannerSlot()
        }
        .background(Web.bg.ignoresSafeArea())
    }

    private var shareText: String {
        let s = model.state
        if model.daily { return app.t("share.artDaily", ["title": artwork.title, "artist": artwork.artist, "time": ArtStats.formatTime(s.elapsedMs), "moves": s.moves, "n": s.puzzle.number ?? 0]) }
        return app.t("share.artFree", ["title": artwork.title, "artist": artwork.artist, "grid": "\(s.dims.cols)×\(s.dims.rows)", "time": ArtStats.formatTime(s.elapsedMs), "moves": s.moves])
    }

    private func resultStat(_ label: String, _ value: String, best: Bool) -> some View {
        VStack(spacing: 2) {
            Text(label).font(Web.font(10, .semibold)).tracking(2).foregroundStyle(Web.muted)
            Text(value).font(Web.font(34, .light, relativeTo: .largeTitle)).monospacedDigit().foregroundStyle(Web.fg)
            Text(best ? app.t("ios.art.newBest") : " ").font(Web.font(11, .semibold)).foregroundStyle(Web.fg)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }
}
