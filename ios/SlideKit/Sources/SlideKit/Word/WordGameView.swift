import SwiftUI
import SlideCore

/// One game screen (daily or endless), laid out like the web's GameView.
struct WordGameView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    let model: WordModel
    let mode: WordMode
    let title: String
    let nextLabel: String
    let onBack: () -> Void
    let onNext: () -> Void
    var streak: Int?
    var showNew = false
    var onNew: () -> Void = {}

    @State private var showClear = false
    @State private var lastTick = Date()
    private let timer = Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()

    private var state: WordGameState? { model.state(mode) }

    var body: some View {
        if let s = state {
            content(s)
        } else {
            Color.clear
        }
    }

    private func content(_ s: WordGameState) -> some View {
        let found = s.found
        let cleared = s.status == .cleared
        return GeometryReader { geo in
            let side = max(260, min(geo.size.width - 32, 420, geo.size.height - 330))
            ZStack {
                VStack(spacing: 0) {
                    WordTopBar(title: title, onBack: onBack) {
                        if let streak { Text("🔥 \(streak)").font(.system(size: 16, weight: .bold)).foregroundStyle(WT.fg).padding(.trailing, 8).accessibilityLabel(app.t("stats.endlessStreak") + " \(streak)") }
                    }
                    ScrollView {
                        VStack(spacing: 0) {
                            HStack(spacing: 8) {
                                WordStat(label: app.t("common.time"), value: wordFormatTime(s.elapsedMs))
                                WordStat(label: app.t("common.moves"), value: "\(s.moves)")
                                WordStat(label: app.t("word.checks"), value: "\(s.checks)")
                            }
                            .padding(.top, 8)
                            .accessibilityElement(children: .combine)
                            VStack(spacing: 0) {
                                Text(app.t("word.found")).font(.system(size: 12, weight: .bold)).tracking(1.2).foregroundStyle(WT.muted)
                                Text("\(found.count) / 4").font(.system(size: 20, weight: .heavy)).tracking(1).foregroundStyle(found.count == 4 ? WT.green(app.colorblind) : WT.fg)
                            }
                            .padding(.top, 6).padding(.bottom, 10)
                            .accessibilityElement(children: .combine)
                            WordBoardView(state: s, side: side, disabled: cleared,
                                          onTile: { cell in act(.move(cell), s) },
                                          onSwipe: { d in act(.dir(d), s) })
                            WordCheckPanel(state: s, disabled: cleared, onRow: { act(.selRow($0), s, haptic: .tap) }, onCheck: { act(.check, s, haptic: .tap) },
                                           onRestart: { act(.restart, s, haptic: .soft) }, showNew: showNew, onNew: onNew)
                            WordClues(state: s, found: found.cards, disabled: cleared, onSelect: { act(.selCard($0), s, haptic: .tap) }, onHint: { c, k in act(.hint(card: c, kind: k), s, haptic: .tap) })
                            WordHistory(entries: s.history)
                            if cleared && !showClear {
                                Button(app.t("result.showResult")) { withAnimation(.easeOut(duration: 0.25)) { showClear = true } }
                                    .buttonStyle(WordButtonStyle(primary: true, big: true)).padding(.top, 12)
                            }
                        }
                        .padding(.horizontal, 16).padding(.bottom, 24)
                        .frame(maxWidth: 480)
                        .frame(maxWidth: .infinity)
                    }
                    .scrollBounceBehavior(.basedOnSize)
                }
                if cleared && showClear {
                    WordClearModal(state: s, nextLabel: nextLabel, onClose: { withAnimation(.easeOut(duration: 0.2)) { showClear = false } }, onNext: onNext, onHome: onBack)
                        .transition(.opacity)
                }
            }
        }
        .background(WT.bg.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { lastTick = Date(); showClear = s.status == .cleared }
        .onDisappear { model.persist() }
        .onReceive(timer) { now in
            let ms = Int(now.timeIntervalSince(lastTick) * 1000)
            lastTick = now
            if scenePhase == .active, ms > 0, ms < 5000 { model.apply(mode, .tick(ms)) }
        }
        .onChange(of: scenePhase) { _, p in lastTick = Date(); if p != .active { model.persist() } }
        .onChange(of: s.status) { old, new in
            guard old == .playing, new == .cleared else { return }
            WordHaptics.clear()
            Task { try? await Task.sleep(for: .milliseconds(450)); withAnimation(.easeOut(duration: 0.25)) { showClear = true } }
        }
        .dynamicTypeSize(.xSmall ... .xxxLarge)
    }

    private enum Haptic { case none, tap, soft }
    private func act(_ a: WordAction, _ s: WordGameState, haptic: Haptic = .none) {
        let before = model.state(mode)
        model.apply(mode, a)
        let changed = model.state(mode) != before
        guard changed else { return }
        switch a {
        case .move, .dir: if model.state(mode)?.status != .cleared { WordHaptics.slide() }
        default: if haptic == .tap { WordHaptics.tap() } else if haptic == .soft { WordHaptics.soft() }
        }
    }
}

struct WordStat: View {
    let label: String, value: String
    var body: some View {
        VStack(spacing: 0) {
            Text(label).font(.system(size: 10, weight: .bold)).tracking(1).foregroundStyle(WT.muted)
            Text(value).font(.system(size: 20, weight: .heavy)).monospacedDigit().foregroundStyle(WT.fg)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 6).padding(.horizontal, 4)
        .background(RoundedRectangle(cornerRadius: 8).fill(WT.surface))
    }
}

struct WordCheckPanel: View {
    @Environment(AppModel.self) private var app
    let state: WordGameState
    let disabled: Bool
    let onRow: (Int) -> Void
    let onCheck: () -> Void
    let onRestart: () -> Void
    var showNew = false
    var onNew: () -> Void = {}

    var body: some View {
        let ready = state.canCheck
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text(app.t("word.row")).font(.system(size: 11, weight: .bold)).tracking(1.1).foregroundStyle(WT.muted).padding(.trailing, 4)
                ForEach(0..<4, id: \.self) { r in
                    let on = state.selRow == r
                    Button { onRow(r) } label: {
                        Text("\(r + 1)").font(.system(size: 16, weight: .heavy)).foregroundStyle(on ? Color.white : WT.fg)
                            .frame(width: 44, height: 44)
                            .background(RoundedRectangle(cornerRadius: 10).fill(on ? WT.foundLine : WT.bg))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(on ? WT.foundLine : WT.line, lineWidth: 2))
                            .opacity(disabled ? 0.45 : 1)
                    }
                    .disabled(disabled)
                    .accessibilityLabel("\(app.t("word.row")) \(r + 1)")
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            Text(ready ? "\(app.t("word.row")) \(state.selRow! + 1) → \(app.t("word.card")) \(state.selCard! + 1)" : " ")
                .font(.system(size: 13)).foregroundStyle(WT.muted).padding(.top, 8).frame(minHeight: 20)
            HStack(spacing: 10) {
                Button(app.t("word.check"), action: onCheck).buttonStyle(WordButtonStyle(primary: true)).disabled(disabled || !ready)
                Button(app.t("word.restart"), action: onRestart).buttonStyle(WordButtonStyle())
                if showNew { Button(app.t("word.new"), action: onNew).buttonStyle(WordButtonStyle()) }
            }
            .padding(.top, 6)
        }
        .padding(.top, 12)
    }
}

/// Wrapping row (the web's flex-wrap).
struct WordFlow: Layout {
    var spacing: CGFloat = 4
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize { layout(proposal.width ?? .infinity, subviews).size }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let r = layout(bounds.width, subviews)
        for (i, p) in r.points.enumerated() { subviews[i].place(at: CGPoint(x: bounds.minX + p.x, y: bounds.minY + p.y), proposal: .unspecified) }
    }
    private func layout(_ width: CGFloat, _ subviews: Subviews) -> (size: CGSize, points: [CGPoint]) {
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, maxW: CGFloat = 0
        var pts: [CGPoint] = []
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x > 0, x + sz.width > width { x = 0; y += rowH + spacing; rowH = 0 }
            pts.append(CGPoint(x: x, y: y))
            x += sz.width + spacing; rowH = max(rowH, sz.height); maxW = max(maxW, x - spacing)
        }
        return (CGSize(width: maxW, height: y + rowH), pts)
    }
}

struct WordClues: View {
    @Environment(AppModel.self) private var app
    let state: WordGameState
    let found: [Bool]
    let disabled: Bool
    let onSelect: (Int) -> Void
    let onHint: (Int, WordHintKind) -> Void

    var body: some View {
        VStack(spacing: 8) {
            Text(app.t("word.clues")).font(.system(size: 12, weight: .bold)).tracking(1.4).foregroundStyle(WT.muted).padding(.top, 18).padding(.bottom, 0)
            Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                GridRow { card(0); card(1) }
                GridRow { card(2); card(3) }
            }
        }
    }

    private func label(_ k: WordHintKind) -> (String, String) {
        switch k {
        case .category: ("word.hintCategory", "word.hintCategoryTitle")
        case .definition: ("word.hintMeaning", "word.hintMeaningTitle")
        case .first: ("word.hintFirst", "word.hintFirstTitle")
        case .extra: ("word.hintExtra", "word.hintExtraTitle")
        }
    }

    private func card(_ i: Int) -> some View {
        let clue = state.puzzle.clues[i]
        let card = state.cards[i]
        let done = found[i]
        let selected = state.selCard == i
        let incompatible = state.selRow != nil && (state.selRow == 3) != (i == 3)
        let known = WordHints.isFullyRevealed(card, word: clue.word)
        let mask = WordHints.masked(clue.word, card)
        let cb = app.colorblind
        let border: Color = selected ? WT.foundLine : (done ? WT.green(cb) : WT.line)
        return VStack(alignment: .leading, spacing: 6) {
            Button { onSelect(i) } label: {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(app.t("word.card")) \(i + 1)").font(.system(size: 12, weight: .heavy)).tracking(0.7).foregroundStyle(WT.fg)
                    Spacer(minLength: 4)
                    Text(app.t("word.letterCount", ["n": clue.word.count]) + (done ? " ✓" : known ? " · \(app.t("word.known"))" : ""))
                        .font(.system(size: 11, weight: done ? .heavy : .semibold)).foregroundStyle(done ? WT.green(cb) : WT.muted).lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(minHeight: 32).contentShape(Rectangle())
            }
            .disabled(disabled)
            .accessibilityAddTraits(selected ? .isSelected : [])
            Text(card.category ? app.t("wordCat.\(clue.category)") : "? ? ?").font(.system(size: 14, weight: .bold)).foregroundStyle(WT.fg)
            HStack(spacing: 4) {
                ForEach(Array(clue.word.enumerated()), id: \.offset) { k, ch in
                    let shown = done || mask[k] != nil
                    Text(shown ? String(ch) : "").font(.system(size: 18, weight: .heavy)).foregroundStyle(done ? WT.green(cb) : WT.fg)
                        .frame(width: 26, height: 30)
                        .overlay(alignment: .bottom) { Rectangle().fill(done ? WT.green(cb) : (mask[k] != nil ? WT.yellow(cb) : WT.muted)).frame(height: 3) }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(done ? clue.word : mask.map { $0 ?? "blank" }.joined(separator: " "))
            if card.definition { Text(clue.definition).font(.system(size: 12)).lineSpacing(1.5).foregroundStyle(WT.muted).fixedSize(horizontal: false, vertical: true) }
            if !done && !disabled {
                WordFlow(spacing: 4) {
                    ForEach(WordHintKind.allCases, id: \.self) { kind in
                        let ok = WordHints.canApply(card, kind, word: clue.word)
                        if (ok || kind == .extra) && !(kind == .extra && WordHints.nextExtraPosition(card, word: clue.word) == nil) {
                            Button { onHint(i, kind) } label: {
                                Text(app.t(label(kind).0)).font(.system(size: 11, weight: .bold)).foregroundStyle(WT.fg)
                                    .padding(.horizontal, 8).padding(.vertical, 6).frame(minHeight: 34)
                                    .background(RoundedRectangle(cornerRadius: 8).fill(WT.bg))
                                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(WT.line, lineWidth: 1))
                                    .opacity(ok ? 1 : 0.4)
                            }
                            .disabled(!ok)
                            .accessibilityHint(app.t(label(kind).1))
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 12).fill(WT.surface))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(border, lineWidth: 2))
        .overlay { if selected { RoundedRectangle(cornerRadius: 10).strokeBorder(WT.foundLine, lineWidth: 2).padding(2) } }
        .opacity(incompatible ? 0.5 : 1)
        .animation(.easeOut(duration: 0.18), value: selected)
    }
}

struct WordHistory: View {
    @Environment(AppModel.self) private var app
    let entries: [WordCheckEntry]
    var body: some View {
        if !entries.isEmpty {
            VStack(spacing: 6) {
                Text(app.t("word.history")).font(.system(size: 12, weight: .bold)).tracking(1.4).foregroundStyle(WT.muted).padding(.top, 18).padding(.bottom, 2)
                ForEach(Array(entries.enumerated()).reversed(), id: \.offset) { i, e in
                    HStack(spacing: 8) {
                        Text("#\(i + 1) · \(app.t("word.row")) \(e.row + 1) → \(app.t("word.card")) \(e.card + 1)")
                            .font(.system(size: 11, weight: .bold)).tracking(0.4).foregroundStyle(WT.muted)
                        Spacer(minLength: 4)
                        HStack(spacing: 3) { ForEach(0..<e.cells.count, id: \.self) { c in WordMiniCell(letter: e.cells[c], mark: e.marks[c], size: 26) } }
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 8).fill(WT.surface))
                }
            }
            .padding(.top, 0)
        }
    }
}

/// Small letter box used in the check history and the how-to example (the web's `.mc`).
struct WordMiniCell: View {
    @Environment(AppModel.self) private var app
    let letter: String?
    let mark: WordMark?
    var size: CGFloat = 26
    var body: some View {
        let cb = app.colorblind
        ZStack {
            RoundedRectangle(cornerRadius: size > 30 ? 6 : 4).fill(letter == nil ? Color.clear : (mark.map { WT.mark($0, cb) } ?? WT.tile))
            Text(letter ?? "").font(.system(size: size > 30 ? 22 : 14, weight: .heavy)).foregroundStyle(mark.map { WT.markFg($0, cb) } ?? WT.fg)
            if cb, let mark { Text(WT.markSymbol(mark)).font(.system(size: size > 30 ? 10 : 7)).foregroundStyle(WT.markFg(mark, cb)).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(2) }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel((letter ?? "blank") + (mark.map { ", \($0.rawValue)" } ?? ""))
    }
}

struct WordClearModal: View {
    @Environment(AppModel.self) private var app
    let state: WordGameState
    let nextLabel: String
    let onClose: () -> Void
    let onNext: () -> Void
    let onHome: () -> Void

    private var shareText: String {
        let p = state.puzzle
        let v: [String: CustomStringConvertible] = ["n": p.number ?? 0, "time": wordFormatTime(state.elapsedMs), "moves": state.moves, "checks": state.checks]
        return app.t(p.mode == .daily ? "share.wordDaily" : "share.word", v) + (state.isNoHintClear ? " ✨" : "")
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea().onTapGesture(perform: onClose)
            VStack(spacing: 0) {
                Text(app.t("result.cleared")).font(.system(size: 22, weight: .heavy)).tracking(3.3).foregroundStyle(WT.green(app.colorblind)).padding(.bottom, 12)
                if state.isNoHintClear {
                    Text(app.t("word.noHint")).font(.system(size: 13, weight: .black)).tracking(1.6).foregroundStyle(Color(white: 0.07))
                        .padding(.horizontal, 14).padding(.vertical, 6).background(Capsule().fill(WT.yellow(app.colorblind))).padding(.bottom, 12)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible())], spacing: 6) {
                    ForEach(state.puzzle.words.all, id: \.self) { w in
                        Text(w).font(.system(size: 16, weight: .heavy)).tracking(3.2).foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 8)
                            .background(RoundedRectangle(cornerRadius: 8).fill(WT.green(app.colorblind)))
                    }
                }
                .padding(.bottom, 14)
                HStack(spacing: 8) {
                    WordStat(label: app.t("common.time"), value: wordFormatTime(state.elapsedMs))
                    WordStat(label: app.t("common.moves"), value: "\(state.moves)")
                    WordStat(label: app.t("word.checks"), value: "\(state.checks)")
                }
                HStack(spacing: 10) {
                    ShareLink(item: shareText) { Text(app.t("share.share")) }.buttonStyle(WordButtonStyle())
                    Button(nextLabel, action: onNext).buttonStyle(WordButtonStyle(primary: true))
                }
                .padding(.top, 14)
                Button(app.t("art.backHome"), action: onHome).font(.system(size: 15)).foregroundStyle(WT.muted).underline().frame(minHeight: 44).padding(.top, 2)
            }
            .padding(.top, 24).padding(.horizontal, 20).padding(.bottom, 8)
            .background(RoundedRectangle(cornerRadius: 16).fill(WT.bg))
            .overlay(alignment: .topTrailing) {
                Button(action: onClose) { Image(systemName: "xmark").font(.system(size: 17)).foregroundStyle(WT.fg).frame(width: 44, height: 44).contentShape(Rectangle()) }
                    .accessibilityLabel(app.t("common.close")).padding(2)
            }
            .frame(maxWidth: 400)
            .padding(16)
            .transition(.scale(scale: 0.88).combined(with: .opacity))
        }
        .accessibilityAddTraits(.isModal)
    }
}
