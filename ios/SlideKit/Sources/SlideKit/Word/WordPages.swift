import SwiftUI
import SlideCore

/// Scrolling page with the web's top bar (used by How to Play and Statistics).
struct WordPage<Content: View>: View {
    let title: String
    let onBack: () -> Void
    var showAd = true
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(spacing: 0) {
            WordTopBar(title: title, onBack: onBack)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    content()
                    if showAd { AdBannerSlot().padding(.top, 26) }
                }
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
                .frame(maxWidth: 480, alignment: .leading).frame(maxWidth: .infinity)
            }
        }
        .background(WT.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .dynamicTypeSize(.xSmall ... .xxxLarge)
    }
}

private struct WordProse: View {
    let text: String
    var body: some View { Text(text).font(.callout).lineSpacing(4).foregroundStyle(WT.fg).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6) }
}
private struct WordBullets: View {
    let items: [String]
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(items, id: \.self) { t in
                HStack(alignment: .firstTextBaseline, spacing: 8) { Text("•").foregroundStyle(WT.fg); Text(t).fixedSize(horizontal: false, vertical: true) }
                    .font(.callout).lineSpacing(4).foregroundStyle(WT.fg)
            }
        }
        .padding(.leading, 6).padding(.vertical, 4)
    }
}
private struct WordHeading: View {
    let text: String
    var body: some View { Text(text.uppercased()).font(.system(size: 14, weight: .bold)).tracking(1.1).foregroundStyle(WT.fg).padding(.top, 20).padding(.bottom, 6).accessibilityAddTraits(.isHeader) }
}

struct WordHowView: View {
    @Environment(AppModel.self) private var app
    let onBack: () -> Void
    var body: some View {
        WordPage(title: app.t("home.howTo"), onBack: onBack, showAd: false) {
            WordProse(text: app.t("wordHow.intro"))
            WordBullets(items: [app.t("wordHow.layout1"), app.t("wordHow.layout2")])
            Text("B I R D\nF I S H\nT R E E\nC A T □").font(.system(size: 18, weight: .bold, design: .monospaced)).tracking(1.8).foregroundStyle(WT.fg)
                .padding(.horizontal, 16).padding(.vertical, 10).background(RoundedRectangle(cornerRadius: 8).fill(WT.surface)).padding(.vertical, 8)
                .accessibilityLabel("BIRD, FISH, TREE, CAT")
            WordHeading(text: app.t("wordHow.hintsTitle"))
            WordProse(text: app.t("wordHow.hints"))
            WordBullets(items: [app.t("wordHow.order"), app.t("wordHow.difficulty"), app.t("wordHow.cards")])
            WordHeading(text: app.t("word.check"))
            WordProse(text: app.t("wordHow.check"))
            HStack(spacing: 4) {
                ForEach(Array([("B", WordMark.green), ("R", .yellow), ("A", .gray), ("D", .green)].enumerated()), id: \.offset) { _, c in WordMiniCell(letter: c.0, mark: c.1, size: 44) }
            }.padding(.vertical, 8)
            WordBullets(items: [app.t("wordHow.green"), app.t("wordHow.yellow"), app.t("wordHow.gray"), app.t("wordHow.checkNotes")])
            WordHeading(text: app.t("wordHow.tipsTitle"))
            WordProse(text: app.t("wordHow.tips"))
            WordProse(text: app.t("wordHow.noHints"))
            WordHeading(text: app.t("help.controls"))
            WordProse(text: app.t("wordHow.controls"))
            WordHeading(text: app.t("help.modes"))
            WordProse(text: app.t("wordHow.modes"))
        }
    }
}

struct WordStatsView: View {
    @Environment(AppModel.self) private var app
    let model: WordModel
    let onBack: () -> Void

    var body: some View {
        let d = model.save
        let today = model.today
        WordPage(title: app.t("stats.title"), onBack: onBack) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
                big(d.completed, app.t("stats.completed"))
                big(d.currentDailyStreak(today: today), app.t("stats.streak"))
                big(d.maxDailyStreak, app.t("stats.bestStreak"))
                big(d.endlessStreak, app.t("stats.endlessStreak"))
                big(d.noHintClears, app.t("stats.noHintClears"))
            }
            WordHeading(text: app.t("stats.endlessBests"))
            table {
                ForEach(WordDifficulty.allCases, id: \.self) { diff in
                    let b = d.bests[diff]
                    row(app.t("diff.\(diff.rawValue)"), b?.timeMs.map { "\(wordFormatTime($0)) / \(app.t("stats.moves", ["n": b?.moves ?? 0]))" } ?? app.t("stats.none"))
                }
            }
            WordHeading(text: app.t("stats.recent"))
            if d.history.isEmpty {
                WordProse(text: app.t("stats.noGames"))
            } else {
                table {
                    ForEach(Array(d.history.suffix(8).reversed().enumerated()), id: \.offset) { _, h in
                        row("\(h.date.dropFirst(5)) \(h.mode == .daily ? app.t("home.dailyShort") : app.t("diff.\(h.difficulty.rawValue)"))",
                            "\(wordFormatTime(h.timeMs)) · \(h.moves)m · \(h.checks)c · \(h.hints)h" + (h.noHint ? " ✨" : ""))
                    }
                }
            }
        }
    }

    private func big(_ n: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text("\(n)").font(.system(size: 30, weight: .bold)).foregroundStyle(WT.fg)
            Text(label).font(.system(size: 10, weight: .bold)).tracking(1).foregroundStyle(WT.muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(WT.surface))
        .accessibilityElement(children: .combine)
    }
    private func table<C: View>(@ViewBuilder _ c: () -> C) -> some View { VStack(spacing: 0) { c() } }
    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(k).foregroundStyle(WT.muted).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Text(v).foregroundStyle(WT.fg).multilineTextAlignment(.trailing)
        }
        .font(.system(size: 14, weight: .medium)).padding(.vertical, 6).padding(.horizontal, 4)
        .overlay(alignment: .bottom) { Rectangle().fill(WT.line).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}
