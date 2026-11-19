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
    private var desc: String { artwork.artwork?.description(in: app.lang) ?? "" }

    var body: some View {
        VStack(spacing: 0) {
            header.padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 2)
            ArtBoardView(model: model, aspect: artwork.aspect, showNumbers: store.save.showNumbers)
                .padding(.horizontal, 16).padding(.vertical, 6)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            extra.padding(.horizontal, 16).padding(.bottom, 8)
        }
        .artScreen()
        .task { await model.prepare() }
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
        // title row (the whole width is the title's) and, below it, Time / Moves on the left and icon buttons on the right
        return VStack(spacing: 4) {
            HStack(alignment: .center, spacing: 6) {
                Button { dismiss() } label: { Image(systemName: "chevron.left").font(.system(size: 18)).foregroundStyle(Web.fg).frame(width: 36, height: 44).contentShape(Rectangle()) }
                    .accessibilityLabel(app.t("common.back"))
                titles
            }
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 6) { stats; actions }
            } else {
                HStack(alignment: .center, spacing: 10) {
                    stats.frame(width: 156)
                    Spacer(minLength: 0)
                    actions
                }
                .padding(.leading, 42) // lines up under the title, past the back arrow
            }
        }
    }

    private var stats: some View {
        HStack(spacing: 0) {
            stat(app.t("common.time"), ArtStats.formatTime(model.state.elapsedMs))
            Rectangle().fill(Web.line).frame(width: 1, height: 26)
            stat(app.t("common.moves"), "\(model.state.moves)")
        }
        .overlay(alignment: .top) { Rectangle().fill(Web.line).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Web.line).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 0) {
            Text(label).font(Web.font(8, .semibold, relativeTo: .caption2)).tracking(1.4).foregroundStyle(Web.muted)
            Text(value).font(Web.font(19, .light, relativeTo: .title3)).monospacedDigit().foregroundStyle(Web.fg).minimumScaleFactor(0.6).lineLimit(1)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 2)
    }

    private var actions: some View {
        HStack(spacing: 6) {
            icon("info.circle", app.t("art.preview")) { showPreview = true }
            icon("shuffle", app.t("art.shuffle")) { model.shuffle(reduceMotion: reduceMotion) }.disabled(model.shuffling).opacity(model.shuffling ? 0.45 : 1)
            let on = store.save.showNumbers
            Button { Haptics.tap(); store.update { $0.showNumbers.toggle() } } label: {
                Text("#").font(Web.font(17, .semibold)).frame(width: 40, height: 36)
            }
            .buttonStyle(WebButtonStyle(filled: on, minHeight: 36)).frame(width: 40)
            .accessibilityLabel(app.t("art.numbers")).accessibilityAddTraits(on ? .isSelected : [])
        }
    }
    private func icon(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: { Haptics.tap(); action() }) { Image(systemName: symbol).font(.system(size: 16, weight: .regular)).frame(width: 40, height: 36) }
            .buttonStyle(WebButtonStyle(minHeight: 36)).frame(width: 40)
            .accessibilityLabel(label)
    }

    // MARK: below the board
    private var extra: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !daily {
                HStack {
                    Menu {
                        ForEach(artLevels, id: \.self) { l in
                            Button { choose(l) } label: {
                                if ArtRules.isLevelLocked(l, premium: app.isPremium) { Label("\(levelName(l)) · \(gridLabel(l))", systemImage: "lock.fill") }
                                else if l == model.state.puzzle.size { Label("\(levelName(l)) · \(gridLabel(l))", systemImage: "checkmark") }
                                else { Text("\(levelName(l)) · \(gridLabel(l))") }
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text("\(levelName(model.state.puzzle.size)) · \(gridLabel(model.state.puzzle.size))").font(Web.font(12, .medium, relativeTo: .caption))
                            Image(systemName: "chevron.up.chevron.down").font(.system(size: 9))
                        }
                        .foregroundStyle(Web.fg).padding(.horizontal, 10).frame(minHeight: 38)
                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(Web.line, lineWidth: 1))
                    }
                    .disabled(model.shuffling).accessibilityLabel(app.t("big.size"))
                    Spacer()
                    Button { onNext() } label: {
                        HStack(spacing: 2) { Text(app.t(artwork.isCustom ? "photos.title" : "art.nextArtwork")); Image(systemName: "chevron.right").font(.system(size: 10)) }
                            .font(Web.font(12, relativeTo: .caption)).foregroundStyle(Web.muted).frame(minHeight: 38)
                    }
                }
            }
            if !artwork.isCustom, !desc.isEmpty {
                Text(desc).font(Web.font(13, relativeTo: .footnote)).lineSpacing(2).lineLimit(typeSize.isAccessibilitySize ? 2 : 3).foregroundStyle(Web.fg)
                    .onTapGesture { showPreview = true }
                HStack(spacing: 4) {
                    Text(artwork.artwork?.museum ?? "").lineLimit(1)
                    Text("·"); creditLink("CC0", artwork.artwork?.licenseUrl)
                    Text("·"); creditLink(app.t("art.source"), artwork.artwork?.sourceUrl)
                    Spacer(minLength: 0)
                }
                .font(Web.font(11, relativeTo: .caption2)).foregroundStyle(Web.muted)
            }
        }
    }
    @ViewBuilder private func creditLink(_ t: String, _ url: String?) -> some View {
        if let url, let u = URL(string: url) { Link(t, destination: u).underline().foregroundStyle(Web.muted) } else { Text(t) }
    }

    private func levelName(_ l: Int) -> String { app.t("level.\(l)") }
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
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: .infinity)
                        .accessibilityLabel(app.t("art.preview"))
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
                .padding(16)
            }
        }
        .background(Web.bg.ignoresSafeArea())
        .presentationDetents([.large])
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
