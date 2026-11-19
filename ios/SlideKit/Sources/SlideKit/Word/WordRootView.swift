import SwiftUI
import SlideCore

enum WordRoute: Hashable { case daily, endless, how, stats }

/// WORD SLIDE (a mini-game inside the app): own NavigationStack, own back arrow that closes the game.
public struct WordRootView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var model = WordModel()
    @State private var path: [WordRoute] = WordRootView.debugRoute()

    public init() {}

    public var body: some View {
        NavigationStack(path: $path) {
            Group {
                if model.catalog == nil { missing } else { home }
            }
            .background(WT.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: WordRoute.self) { route in
                switch route {
                case .daily: DailyHost(model: model, path: $path)
                case .endless: EndlessHost(model: model, path: $path)
                case .how: WordHowView { pop() }
                case .stats: WordStatsView(model: model) { pop() }
                }
            }
        }
        .tint(WT.fg)
    }

    private func pop() { if !path.isEmpty { path.removeLast() } }

    private var missing: some View {
        VStack { WordTopBar(title: "WORD SLIDE") { dismiss() }; Spacer(); Text(app.t("ios.word.noData")).foregroundStyle(WT.muted).padding(); Spacer() }
    }

    private var home: some View {
        let today = model.today
        let done = model.save.dailyHistory[today] != nil
        let streak = model.save.currentDailyStreak(today: today)
        return VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 0) {
                    HStack {
                        Button { dismiss() } label: {
                            HStack(spacing: 2) {
                                Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold))
                                Text(app.t("common.toMain")).font(.system(size: 12, weight: .heavy)).tracking(1.7)
                            }
                            .foregroundStyle(WT.muted).padding(.horizontal, 4).frame(minHeight: 44).contentShape(Rectangle())
                        }
                        .accessibilityLabel(app.t("common.back"))
                        Spacer()
                    }
                    logo.padding(.top, 24).padding(.bottom, 16)
                    VStack(spacing: 10) {
                        Button { model.openDaily(); path.append(.daily) } label: {
                            Text(app.t("home.dailyN", ["n": DateKeys.dailyNumber(today)]) + (done ? " ✓" : "") + (streak > 0 ? " · 🔥 \(streak)" : ""))
                                .lineLimit(2).minimumScaleFactor(0.8)
                        }
                        .buttonStyle(WordButtonStyle(primary: true, big: true))
                        Button { path.append(.endless) } label: { Text(app.t("home.endless")) }
                            .buttonStyle(WordButtonStyle(big: true))
                    }
                    HStack(spacing: 18) {
                        link(app.t("home.howTo")) { path.append(.how) }
                        link(app.t("home.stats")) { path.append(.stats) }
                    }
                    .padding(.top, 10)
                    AdBannerSlot().padding(.top, 26)
                }
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
                .frame(maxWidth: 480).frame(maxWidth: .infinity)
            }
        }
        .dynamicTypeSize(.xSmall ... .xxxLarge)
    }

    private func link(_ text: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text).font(.system(size: 14)).foregroundStyle(WT.muted).underline(true).padding(.horizontal, 2).frame(minHeight: 44).contentShape(Rectangle())
        }
    }

    private var logo: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) { ForEach(Array("WORD".enumerated()), id: \.offset) { _, c in logoTile(c, WT.green(app.colorblind)) } }
            HStack(spacing: 6) { ForEach(Array("SLIDE".enumerated()), id: \.offset) { i, c in logoTile(c, i % 2 == 1 ? WT.yellow(app.colorblind) : WT.gray) } }
        }
        .accessibilityElement(children: .ignore).accessibilityLabel("WORD SLIDE")
    }
    private func logoTile(_ c: Character, _ color: Color) -> some View {
        Text(String(c)).font(.system(size: 28, weight: .black)).foregroundStyle(.white)
            .frame(width: 52, height: 52).background(RoundedRectangle(cornerRadius: 9).fill(color))
    }

    /// DEBUG only (screenshots): `-wordScreen daily|endless|stats|how|home`, `-wordDiff easy|normal|hard` starts an endless game.
    static func debugRoute() -> [WordRoute] {
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: "-wordScreen"), i + 1 < a.count else { return [] }
        switch a[i + 1] {
        case "daily": return [.daily]
        case "endless": return [.endless]
        case "stats": return [.stats]
        case "how": return [.how]
        default: return []
        }
        #else
        return []
        #endif
    }
}

private struct DailyHost: View {
    @Environment(AppModel.self) private var app
    let model: WordModel
    @Binding var path: [WordRoute]
    var body: some View {
        if model.state(.daily) == nil { Color.clear.onAppear { model.openDaily() } } else { game }
    }
    private var game: some View {
        WordGameView(model: model, mode: .daily, title: app.t("art.dailyTitle", ["n": DateKeys.dailyNumber(model.dailyKey)]), nextLabel: app.t("home.endless"),
                     onBack: { if !path.isEmpty { path.removeLast() } }, onNext: { path = [.endless] })
    }
}

private struct EndlessHost: View {
    @Environment(AppModel.self) private var app
    let model: WordModel
    @Binding var path: [WordRoute]
    private func back() { if !path.isEmpty { path.removeLast() } }

    var body: some View {
        if let s = model.state(.endless) {
            WordGameView(model: model, mode: .endless, title: "\(app.t("home.endless")) · \(app.t("diff.\(s.puzzle.difficulty.rawValue)"))", nextLabel: app.t("result.next"),
                         onBack: back, onNext: { model.startEndless(s.puzzle.difficulty) }, streak: model.save.endlessStreak, showNew: true, onNew: { model.abandonEndless() })
                .id(s.puzzle.id)
        } else {
            VStack(spacing: 0) {
                WordTopBar(title: app.t("home.endless"), onBack: back)
                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(WordDifficulty.allCases, id: \.self) { d in
                            let best = model.save.bests[d]
                            Button { model.startEndless(d) } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(app.t("diff.\(d.rawValue)")).font(.system(size: 18, weight: .bold)).foregroundStyle(WT.fg)
                                    if let t = best?.timeMs { Text("\(wordFormatTime(t)) · \(best?.moves ?? 0)").font(.system(size: 13)).foregroundStyle(WT.muted) }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 14)
                                .background(RoundedRectangle(cornerRadius: 12).fill(WT.surface))
                                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(WT.line, lineWidth: 2))
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                        AdBannerSlot().padding(.top, 26)
                    }
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
                    .frame(maxWidth: 480).frame(maxWidth: .infinity)
                }
            }
            .background(WT.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .dynamicTypeSize(.xSmall ... .xxxLarge)
            .onAppear { debugAutoStart() }
        }
    }

    private func debugAutoStart() {
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments
        if let i = a.firstIndex(of: "-wordDiff"), i + 1 < a.count, let d = WordDifficulty(rawValue: a[i + 1]), model.state(.endless) == nil { model.startEndless(d) }
        #endif
    }
}
