import SwiftUI
import SlideCore

enum BigRoute: Hashable { case daily, endless, how, stats }

/// BIG SLIDE mini-game. Presented full screen from the app's menu; it owns its navigation and a back control that leaves the game.
public struct BigRootView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var model = BigModel()
    @State private var path: [BigRoute] = []
    @State private var showSettings = false

    public init() {}

    public var body: some View {
        NavigationStack(path: $path) {
            BigHome(model: model, onBack: { dismiss() }, open: { path.append($0) }, showSettings: { showSettings = true })
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: BigRoute.self) { route in
                    Group {
                        switch route {
                        case .daily: BigGameScreen(model: model, mode: .daily, onBack: pop, onNext: { path = [.endless] })
                            .task { await model.openDaily() }
                        case .endless: BigEndlessScreen(model: model, onBack: pop)
                        case .how: BigHowScreen(onBack: pop)
                        case .stats: BigStatsScreen(model: model, onBack: pop)
                        }
                    }
                    .toolbar(.hidden, for: .navigationBar)
                }
        }
        .background(BigTheme.bg.ignoresSafeArea())
        .sheet(isPresented: $showSettings) { SettingsView() }
        #if DEBUG
        .task { debugDeepLink() }
        #endif
    }

    private func pop() { if !path.isEmpty { path.removeLast() } }

    #if DEBUG
    /// `-bigScreen daily|endless|stats|how|home` jumps straight to a screen (for screenshots).
    private func debugDeepLink() {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-bigScreen"), i + 1 < args.count, path.isEmpty else { return }
        switch args[i + 1] {
        case "daily": path = [.daily]
        case "endless": path = [.endless]
        case "stats": path = [.stats]
        case "how": path = [.how]
        default: break
        }
    }
    #endif
}

// MARK: home

private struct BigHome: View {
    @Environment(AppModel.self) private var app
    let model: BigModel
    let onBack: () -> Void
    let open: (BigRoute) -> Void
    let showSettings: () -> Void

    var body: some View {
        let today = model.today
        let streak = BigStats.currentDailyStreak(model.save.dailyHistory, today: today)
        let daily = app.t("home.dailyN", ["n": DateKeys.dailyNumber(today)]) + (model.save.dailyHistory[today] != nil ? " ✓" : "") + (streak > 0 ? " · 🔥 \(streak)" : "")
        ScrollView {
            VStack(spacing: 0) {
                Button(action: onBack) {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left").font(.system(size: 13, weight: .medium))
                        Text(app.t("common.toMain")).font(BigTheme.font(14, .bold)).tracking(1.6)
                    }
                    .foregroundStyle(BigTheme.muted).frame(minHeight: 44).contentShape(Rectangle())
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(app.t("common.back") + " " + app.t("common.toMain"))

                BigLogo().padding(.top, 8).padding(.bottom, 14)

                VStack(spacing: 10) {
                    Button(daily) { open(.daily) }.buttonStyle(BigButtonStyle(primary: true, large: true))
                    Button(app.t("home.endless")) { open(.endless) }.buttonStyle(BigButtonStyle(large: true))
                }

                HStack(spacing: 18) {
                    link(app.t("home.howTo")) { open(.how) }
                    link(app.t("home.stats")) { open(.stats) }
                    link(app.t("home.settings"), showSettings)
                }
                .padding(.top, 10)

                AdBannerSlot().padding(.top, 24)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(BigTheme.bg.ignoresSafeArea())
    }

    private func link(_ s: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(s).font(BigTheme.font(14, .regular)).underline(true, pattern: .solid).foregroundStyle(BigTheme.muted)
                .padding(.horizontal, 2).frame(minHeight: 44).contentShape(Rectangle())
        }
    }
}

private struct BigLogo: View {
    private func tile(_ s: String, _ color: Color, wide: Bool = false) -> some View {
        Text(s).font(BigTheme.font(28, .bold)).foregroundStyle(.white)
            .padding(.horizontal, wide ? 14 : 0)
            .frame(width: wide ? nil : 52, height: 52)
            .background(RoundedRectangle(cornerRadius: 9).fill(color))
            .padding(3)
    }
    private var big: some View { tile("BIG", BigTheme.logoBig, wide: true) }
    private func slide(_ range: Range<Int>) -> some View {
        HStack(spacing: 0) {
            ForEach(Array("SLIDE".enumerated()).filter { range.contains($0.offset) }, id: \.offset) { i, ch in
                tile(String(ch), i % 2 == 1 ? BigTheme.yellow : BigTheme.gray)
            }
        }
    }
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 0) { big; slide(0..<5) }
            VStack(spacing: 0) { HStack(spacing: 0) { big; slide(0..<4) }; slide(4..<5) } // wraps like the web on narrow screens
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("BIG SLIDE")
    }
}

// MARK: endless picker + game

private struct BigEndlessScreen: View {
    @Environment(AppModel.self) private var app
    let model: BigModel
    let onBack: () -> Void
    @State private var size = 4
    @State private var variant: BigVariant = .classic
    @State private var loaded = false

    var body: some View {
        Group {
            if model.endless != nil {
                BigGameScreen(model: model, mode: .endless, onBack: onBack, onNext: { next() })
            } else {
                picker
            }
        }
        .onAppear {
            if !loaded { loaded = true; size = model.save.lastSize; variant = model.save.lastVariant; model.openEndless() }
        }
    }

    private func next() {
        guard let p = model.endless?.puzzle else { return }
        Task { await model.startEndless(variant: p.variant, size: p.size, difficulty: p.difficulty) }
    }

    private func label(_ s: String) -> some View {
        Text(s.uppercased()).font(BigTheme.font(11, .bold)).tracking(1.3).foregroundStyle(BigTheme.muted)
            .padding(.top, 10).padding(.bottom, 6).accessibilityAddTraits(.isHeader)
    }

    private var picker: some View {
        VStack(spacing: 0) {
            BigTopBar(title: app.t("home.endless"), backLabel: app.t("common.back"), onBack: onBack)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    label(app.t("big.blocks"))
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                        ForEach(BigVariant.allCases, id: \.self) { v in
                            Button { variant = v } label: {
                                Text(bigVariantConfig(v).label).font(BigTheme.font(15, .bold)).foregroundStyle(BigTheme.fg)
                                    .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading).padding(.horizontal, 12).padding(.vertical, 10)
                                    .background(RoundedRectangle(cornerRadius: 12).fill(variant == v ? BigTheme.surface : BigTheme.bg))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(variant == v ? BigTheme.accent : BigTheme.line, lineWidth: variant == v ? 4 : 2))
                                    .contentShape(Rectangle())
                            }
                            .accessibilityAddTraits(variant == v ? .isSelected : [])
                        }
                    }
                    .padding(.bottom, 14)

                    label(app.t("big.size"))
                    HStack(spacing: 6) {
                        ForEach(bigBoardSizes, id: \.self) { s in
                            Button { size = s } label: {
                                Text("\(s)×\(s)").font(BigTheme.font(16, .bold)).foregroundStyle(size == s ? BigTheme.accentFg : BigTheme.fg)
                                    .frame(maxWidth: .infinity, minHeight: 44).padding(.vertical, 5)
                                    .background(RoundedRectangle(cornerRadius: 10).fill(size == s ? BigTheme.accent : BigTheme.bg))
                                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(size == s ? BigTheme.accent : BigTheme.line, lineWidth: 2))
                                    .contentShape(Rectangle())
                            }
                            .accessibilityAddTraits(size == s ? .isSelected : [])
                        }
                    }
                    .padding(.bottom, 14)

                    label(app.t("big.difficulty"))
                    if model.generating {
                        Text(app.t("big.building")).font(BigTheme.font(15, .regular)).foregroundStyle(BigTheme.muted)
                            .frame(maxWidth: .infinity).padding(.vertical, 24).accessibilityAddTraits(.updatesFrequently)
                    } else {
                        VStack(spacing: 10) {
                            ForEach(BigDifficulty.allCases, id: \.self) { d in
                                let best = model.save.bests[BigSave.bestKey(size: size, difficulty: d, variant: variant)]
                                Button { Task { await model.startEndless(variant: variant, size: size, difficulty: d) } } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(app.t("diff.\(d.rawValue)")).font(BigTheme.font(18, .bold)).foregroundStyle(BigTheme.fg)
                                        if let t = best?.timeMs { Text("\(BigStats.formatTime(t)) · \(best?.moves ?? 0)").font(BigTheme.font(13, .regular)).foregroundStyle(BigTheme.muted) }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 14)
                                    .background(RoundedRectangle(cornerRadius: 12).fill(BigTheme.surface))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(BigTheme.line, lineWidth: 2))
                                    .contentShape(Rectangle())
                                }
                            }
                        }
                        if model.failed { Text(app.t("ios.big.failed")).font(BigTheme.font(13, .regular)).foregroundStyle(BigTheme.muted).padding(.top, 10) }
                    }
                    AdBannerSlot().padding(.top, 24)
                }
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
                .frame(maxWidth: 480).frame(maxWidth: .infinity)
            }
        }
        .background(BigTheme.bg.ignoresSafeArea())
    }
}

// MARK: how to / stats

private struct BigPage<Content: View>: View {
    @Environment(AppModel.self) private var app
    let title: String
    let onBack: () -> Void
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(spacing: 0) {
            BigTopBar(title: title, backLabel: app.t("common.back"), onBack: onBack)
            ScrollView {
                VStack(alignment: .leading, spacing: 0, content: content)
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
                    .frame(maxWidth: 480).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(BigTheme.bg.ignoresSafeArea())
    }
}

private struct BigHowScreen: View {
    @Environment(AppModel.self) private var app
    let onBack: () -> Void

    private func p(_ k: String, muted: Bool = false) -> some View {
        Text(app.t(k)).font(BigTheme.font(15, .regular)).lineSpacing(5).foregroundStyle(muted ? BigTheme.muted : BigTheme.fg)
            .fixedSize(horizontal: false, vertical: true).padding(.vertical, 6)
    }
    private func li(_ k: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("•").font(BigTheme.font(15, .regular)).foregroundStyle(BigTheme.fg)
            Text(app.t(k)).font(BigTheme.font(15, .regular)).lineSpacing(5).foregroundStyle(BigTheme.fg).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.leading, 6).padding(.vertical, 4)
    }
    private func h(_ k: String) -> some View {
        Text(app.t(k).uppercased()).font(BigTheme.font(14, .bold)).tracking(1.1).foregroundStyle(BigTheme.fg)
            .padding(.top, 20).padding(.bottom, 6).accessibilityAddTraits(.isHeader)
    }
    var body: some View {
        BigPage(title: app.t("home.howTo"), onBack: onBack) {
            p("bigHow.intro")
            ForEach(["bigHow.tiles", "bigHow.slide", "bigHow.blocks", "bigHow.rules", "bigHow.found"], id: \.self, content: li)
            h("bigHow.setsTitle")
            ForEach(["bigHow.classic", "bigHow.duo", "bigHow.shapes", "bigHow.mega"], id: \.self, content: li)
            h("help.controls")
            p("bigHow.controls")
            h("help.modes")
            p("bigHow.modes")
            p("bigHow.note", muted: true).padding(.top, 6)
        }
    }
}

private struct BigStatsScreen: View {
    @Environment(AppModel.self) private var app
    let model: BigModel
    let onBack: () -> Void

    private func big(_ n: Int, _ l: String) -> some View {
        VStack(spacing: 2) {
            Text("\(n)").font(BigTheme.font(30, .bold)).foregroundStyle(BigTheme.fg)
            Text(l).font(BigTheme.font(10, .bold)).tracking(1).foregroundStyle(BigTheme.muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(BigTheme.surface))
        .accessibilityElement(children: .combine)
    }
    private func h(_ s: String) -> some View {
        Text(s.uppercased()).font(BigTheme.font(14, .bold)).tracking(1.1).foregroundStyle(BigTheme.fg)
            .padding(.top, 20).padding(.bottom, 6).accessibilityAddTraits(.isHeader)
    }
    private func row(_ l: String, _ r: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(l).font(BigTheme.font(14, .medium)).foregroundStyle(BigTheme.muted)
            Spacer(minLength: 8)
            Text(r).font(BigTheme.font(14, .medium)).foregroundStyle(BigTheme.fg).multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 6).padding(.horizontal, 4)
        .overlay(alignment: .bottom) { Rectangle().fill(BigTheme.line).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
    private func diff(_ raw: String) -> String { BigDifficulty(rawValue: raw).map { app.t("diff.\($0.rawValue)") } ?? raw }
    private func variantName(_ v: BigVariant?) -> String { (v == nil || v == .classic) ? "" : bigVariantConfig(v!).label + " " }

    var body: some View {
        let s = model.save
        let today = model.today
        BigPage(title: app.t("stats.title"), onBack: onBack) {
            let cols = [GridItem(.flexible(), spacing: 10), GridItem(.flexible())]
            LazyVGrid(columns: cols, spacing: 10) {
                big(s.completed, app.t("stats.completed"))
                big(BigStats.currentDailyStreak(s.dailyHistory, today: today), app.t("stats.streak"))
                big(BigStats.maxDailyStreak(s.dailyHistory), app.t("stats.bestStreak"))
                big(s.endlessStreak, app.t("stats.endlessStreak"))
            }
            h(app.t("stats.endlessBests"))
            if s.bests.isEmpty {
                Text(app.t("stats.noGames")).font(BigTheme.font(15, .regular)).foregroundStyle(BigTheme.fg).padding(.vertical, 6)
            } else {
                ForEach(s.bests.keys.sorted(), id: \.self) { k in
                    let parts = k.split(separator: "-").map(String.init)
                    let (v, size, d) = parts.count == 3 ? (parts[0], parts[1], parts[2]) : ("classic", parts.first ?? "4", parts.last ?? "normal")
                    let b = s.bests[k]!
                    row("\(v == "classic" ? "" : (BigVariant(rawValue: v).map { bigVariantConfig($0).label } ?? v) + " ")\(size)×\(size) \(diff(d))",
                        b.timeMs.map { "\(BigStats.formatTime($0)) / \(app.t("stats.moves", ["n": b.moves ?? 0]))" } ?? "–")
                }
            }
            h(app.t("stats.recent"))
            if s.history.isEmpty {
                Text(app.t("stats.noGames")).font(BigTheme.font(15, .regular)).foregroundStyle(BigTheme.fg).padding(.vertical, 6)
            } else {
                ForEach(Array(s.history.suffix(8).reversed().enumerated()), id: \.offset) { _, r in
                    row("\(r.date.dropFirst(5)) " + (r.mode == .daily ? app.t("home.dailyShort") : "\(variantName(r.variant))\(r.size)×\(r.size) \(diff(r.difficulty.rawValue))"),
                        "\(BigStats.formatTime(r.timeMs)) · \(r.moves)m · \(r.bigMoves)B")
                }
            }
            AdBannerSlot().padding(.top, 24)
        }
    }
}
