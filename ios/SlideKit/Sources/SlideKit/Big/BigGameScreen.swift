import SwiftUI
import SlideCore

/// The playing screen shared by Daily and Endless: top bar, three stats, board, goal picture and buttons, plus the clear sheet.
struct BigGameScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    let model: BigModel
    let mode: BigMode
    let onBack: () -> Void
    var onNext: () -> Void

    @State private var goalOpen = true

    private var state: BigState? { model.state(mode) }

    var body: some View {
        VStack(spacing: 0) {
            BigTopBar(title: title, backLabel: app.t("common.back"), onBack: onBack, small: true) {
                if mode == .endless {
                    Text("🔥 \(model.save.endlessStreak)")
                        .font(BigTheme.font(14, .bold)).foregroundStyle(BigTheme.fg)
                        .padding(.trailing, 12)
                        .accessibilityLabel(app.t("stats.endlessStreak") + " \(model.save.endlessStreak)")
                }
            }
            if let s = state {
                content(s)
            } else if model.failed {
                Spacer()
                Text(app.t("ios.big.failed")).font(BigTheme.font(15, .regular)).foregroundStyle(BigTheme.muted).multilineTextAlignment(.center).padding(24)
                Button(app.t("common.back"), action: onBack).buttonStyle(BigButtonStyle()).padding(.horizontal, 60)
                Spacer()
            } else {
                Spacer()
                Text(app.t("big.building")).font(BigTheme.font(15, .medium)).foregroundStyle(BigTheme.muted)
                    .accessibilityAddTraits(.updatesFrequently)
                Spacer()
            }
        }
        .background(BigTheme.bg.ignoresSafeArea())
        .overlay { if let s = state, s.status == .cleared, model.showClear { clearSheet(s) } }
        .animation(.easeOut(duration: 0.25), value: model.showClear)
        .task(id: scenePhase) {
            model.resetClock()
            if scenePhase != .active { model.flush() }
            while !Task.isCancelled {
                model.tick(mode, active: scenePhase == .active)
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
        .onDisappear { model.flush() }
    }

    private var title: String {
        guard let s = state else { return mode == .daily ? app.t("art.dailyTitle", ["n": DateKeys.dailyNumber(model.today)]) : app.t("home.endless") }
        if mode == .daily { return app.t("art.dailyTitle", ["n": s.puzzle.number ?? DateKeys.dailyNumber(model.today)]) }
        let p = s.puzzle
        let v = p.variant == .classic ? "" : "\(bigVariantConfig(p.variant).label) · "
        return "\(app.t("home.endless")) · \(v)\(p.size)×\(p.size) · \(app.t("diff.\(p.difficulty.rawValue)"))"
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 0) {
            Text(label).font(BigTheme.font(10, .bold)).tracking(1).foregroundStyle(BigTheme.muted).lineLimit(1).minimumScaleFactor(0.6)
            Text(value).font(BigTheme.font(20, .bold)).monospacedDigit().foregroundStyle(BigTheme.fg)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 6).padding(.horizontal, 4)
        .background(RoundedRectangle(cornerRadius: 8).fill(BigTheme.surface))
        .accessibilityElement(children: .combine)
    }

    private func content(_ s: BigState) -> some View {
        GeometryReader { geo in
            let cleared = s.status == .cleared
            let controls: CGFloat = (goalOpen ? 180 : 60) + (cleared && !model.showClear ? 64 : 0)
            let side = max(240, min(geo.size.width - 32, 560, geo.size.height - 58 - controls - 24))
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    stat(app.t("common.time"), BigStats.formatTime(s.elapsedMs))
                    stat(app.t("common.moves"), "\(s.moves)")
                    stat(app.t("big.bigMoves"), "\(s.bigMoves)")
                }
                .padding(.top, 8)
                .accessibilityElement(children: .contain)

                BigBoardView(
                    pieces: s.pieces, goal: s.puzzle.goal, n: s.size,
                    selectedId: s.selected, selectedDirs: s.selected.map { s.legalDirs($0) } ?? [],
                    shake: model.shake, disabled: cleared, colorblind: app.colorblind,
                    label: { pieceLabel($0) }, dirLabel: { dirLabel($0, $1) },
                    onTap: { model.tap(mode, $0) }, onMove: { model.move(mode, $0, $1) },
                    legal: { model.legalDirs(mode, $0) }
                )
                .frame(width: side, height: side)
                .frame(maxWidth: .infinity)
                .accessibilityLabel(app.t("ios.big.board", ["n": s.size]))

                controlsRow(s)
                if cleared && !model.showClear {
                    Button(app.t("result.showResult")) { model.showClear = true }.buttonStyle(BigButtonStyle(primary: true))
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
        }
    }

    private func controlsRow(_ s: BigState) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Button { withAnimation(.easeOut(duration: 0.2)) { goalOpen.toggle() } } label: {
                    HStack(spacing: 4) {
                        Text(app.t("big.goal")).font(BigTheme.font(12, .bold)).tracking(1.4)
                        Image(systemName: goalOpen ? "arrowtriangle.down.fill" : "arrowtriangle.right.fill").font(.system(size: 7))
                    }
                    .foregroundStyle(BigTheme.muted).frame(minHeight: 36).contentShape(Rectangle())
                }
                .accessibilityLabel(app.t("big.goal"))
                .accessibilityValue(goalOpen ? "▾" : "▸")
                if goalOpen { BigGoalMini(goal: s.puzzle.goal, n: s.size, label: app.t("ios.big.goalLabel")) }
            }
            Spacer(minLength: 0)
            VStack(spacing: 10) {
                Button(app.t("big.restart")) { model.restart(mode) }.buttonStyle(BigButtonStyle())
                if mode == .endless { Button(app.t("big.new")) { model.abandonEndless() }.buttonStyle(BigButtonStyle()) }
            }
            .frame(width: 150)
        }
    }

    private func pieceLabel(_ p: BigPiece) -> String {
        let key = p.kind == .big ? "ios.big.bigTile" : "ios.big.tile"
        return app.t(key, ["label": p.label, "r": p.r + 1, "c": p.c + 1])
    }
    private func dirLabel(_ p: BigPiece, _ d: BigDirection) -> String {
        let name = app.t("ios.big.dir." + d.rawValue)
        return app.t("ios.big.moveDir", ["label": p.label, "dir": name])
    }

    // MARK: clear sheet

    private func clearSheet(_ s: BigState) -> some View {
        let time = BigStats.formatTime(s.elapsedMs)
        let text = s.puzzle.mode == .daily
            ? app.t("share.bigDaily", ["n": s.puzzle.number ?? "", "time": time, "moves": s.moves])
            : app.t("share.big", ["size": s.puzzle.size, "time": time, "moves": s.moves])
        return ZStack {
            Color.black.opacity(0.5).ignoresSafeArea().onTapGesture { model.showClear = false }
            VStack(spacing: 0) {
                HStack { Spacer(); Button { model.showClear = false } label: {
                    Image(systemName: "xmark").font(.system(size: 17)).foregroundStyle(BigTheme.fg).frame(width: 44, height: 44).contentShape(Rectangle())
                }.accessibilityLabel(app.t("common.close")) }
                Text(app.t("result.cleared")).font(BigTheme.font(24, .bold)).tracking(3.6).foregroundStyle(BigTheme.home(app.colorblind))
                    .padding(.top, -8).padding(.bottom, 14).accessibilityAddTraits(.isHeader)
                HStack(spacing: 8) {
                    stat(app.t("common.time"), time)
                    stat(app.t("common.moves"), "\(s.moves)")
                    stat(app.t("big.bigMoves"), "\(s.bigMoves)")
                }
                HStack(spacing: 10) {
                    ShareLink(item: URL(string: "https://slides.ryouy.workers.dev/s/big/")!, message: Text(text)) {
                        Text(app.t("share.share"))
                    }
                    .buttonStyle(BigButtonStyle())
                    Button(mode == .daily ? app.t("home.endless") : app.t("result.next")) { model.showClear = false; onNext() }
                        .buttonStyle(BigButtonStyle(primary: true))
                }
                .padding(.top, 14)
                Button(app.t("art.backHome")) { model.showClear = false; onBack() }
                    .font(BigTheme.font(14, .regular)).foregroundStyle(BigTheme.muted).underline()
                    .frame(minHeight: 44)
            }
            .padding(.horizontal, 20).padding(.bottom, 8)
            .frame(maxWidth: 400)
            .background(RoundedRectangle(cornerRadius: 16).fill(BigTheme.bg))
            .padding(16)
            .transition(.scale(scale: 0.92).combined(with: .opacity))
        }
        .accessibilityAddTraits(.isModal)
        .transition(.opacity)
    }
}

/// Small non-interactive picture of the goal layout.
struct BigGoalMini: View {
    let goal: [BigPiece]
    let n: Int
    let label: String
    private let side: CGFloat = 128
    var body: some View {
        let cell = (side - 8) / CGFloat(n)
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 10).fill(BigTheme.surface)
            ForEach(0..<(n * n), id: \.self) { i in
                RoundedRectangle(cornerRadius: 3).fill(BigTheme.bg.opacity(0.55))
                    .frame(width: cell - 2, height: cell - 2)
                    .offset(x: 4 + CGFloat(i % n) * cell + 1, y: 4 + CGFloat(i / n) * cell + 1)
            }
            ForEach(goal, id: \.id) { p in
                BigPieceShape(piece: p, cell: cell, mini: true)
                    .offset(x: 4 + CGFloat(p.c) * cell + 1, y: 4 + CGFloat(p.r) * cell + 1)
            }
        }
        .frame(width: side, height: side)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}
