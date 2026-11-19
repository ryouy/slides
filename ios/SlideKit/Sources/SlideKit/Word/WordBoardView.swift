import SwiftUI
import SlideCore

/// The 4x4 board. Tap a tile beside the blank, or swipe anywhere on the board (the swipe direction is the direction the tile travels).
struct WordBoardView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let state: WordGameState
    let side: CGFloat
    let disabled: Bool
    let onTile: (Int) -> Void
    let onSwipe: (WordDirection) -> Void

    private let gap: CGFloat = 8
    private var cell: CGFloat { (side - gap) / 4 }
    private var found: WordFound { state.found }

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 14).fill(WT.surface)
            ForEach(state.board.compactMap { $0 }.sorted { $0.id < $1.id }, id: \.id) { tile in
                let idx = state.board.firstIndex(where: { $0?.id == tile.id }) ?? 0
                tileView(tile, idx)
                    .frame(width: cell - gap, height: cell - gap)
                    .offset(x: gap / 2 + CGFloat(WordBoardOps.col(idx)) * cell + gap / 2, y: gap / 2 + CGFloat(WordBoardOps.row(idx)) * cell + gap / 2)
                    .animation(reduceMotion ? .linear(duration: 0.01) : .spring(response: 0.3, dampingFraction: 0.78), value: idx)
            }
            if let r = state.selRow {
                RoundedRectangle(cornerRadius: 12).strokeBorder(WT.foundLine, lineWidth: 3)
                    .frame(width: (side - gap) * (r == 3 ? 0.75 : 1), height: cell)
                    .offset(x: gap / 2, y: gap / 2 + CGFloat(r) * cell)
                    .allowsHitTesting(false)
                    .animation(.easeOut(duration: 0.2), value: r)
            }
        }
        .frame(width: side, height: side)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .local).onEnded { v in
                if disabled { return }
                let dx = v.translation.width, dy = v.translation.height
                if max(abs(dx), abs(dy)) < 24 {
                    let x = Int((v.startLocation.x - gap / 2) / cell), y = Int((v.startLocation.y - gap / 2) / cell)
                    if (0..<4).contains(x), (0..<4).contains(y) { onTile(y * 4 + x) }
                } else {
                    onSwipe(abs(dx) > abs(dy) ? (dx > 0 ? .right : .left) : (dy > 0 ? .down : .up))
                }
            }
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(app.t("ios.word.board"))
    }

    @ViewBuilder private func tileView(_ tile: WordTile, _ idx: Int) -> some View {
        let mark = state.marks?[idx] ?? nil
        let isFound = found.rows[WordBoardOps.row(idx)] && idx < 15 && mark == nil
        let cb = app.colorblind
        let fill: Color = mark.map { WT.mark($0, cb) } ?? (isFound ? WT.found : WT.tile)
        ZStack {
            RoundedRectangle(cornerRadius: 10).fill(fill)
            if isFound { RoundedRectangle(cornerRadius: 10).strokeBorder(WT.green(cb), lineWidth: 3) }
            Text(tile.letter)
                .font(.system(size: min(40, max(22, side * 0.097)), weight: .heavy))
                .foregroundStyle(mark.map { WT.markFg($0, cb) } ?? WT.fg)
            if cb, let mark {
                Text(WT.markSymbol(mark)).font(.system(size: 11)).foregroundStyle(WT.markFg(mark, cb))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(.top, 3).padding(.trailing, 6)
            }
        }
        .animation(.easeOut(duration: 0.2), value: mark)
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(app.t("ios.word.tile", ["letter": tile.letter, "row": WordBoardOps.row(idx) + 1, "col": WordBoardOps.col(idx) + 1]) + (mark.map { ", \($0.rawValue)" } ?? "") + (isFound ? ", ✓" : ""))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { if !disabled { onTile(idx) } }
    }
}
