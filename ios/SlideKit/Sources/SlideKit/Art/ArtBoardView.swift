import SwiftUI
import SlideCore

/// The board: the painting's own proportions, every tile shows its own part of the picture (nothing cropped).
/// Tap a tile, or drag it toward the blank; tiles in line with the blank slide together.
struct ArtBoardView: View {
    @Environment(AppModel.self) private var app
    let model: ArtGameModel
    let aspect: Double
    let showNumbers: Bool

    var body: some View {
        let d = model.state.dims
        let complete = model.state.cleared && !model.lineMoving
        let gap: CGFloat = complete ? 0 : (d.cols > 6 || d.rows > 6 ? 1.5 : 3)
        Color.clear
            .aspectRatio(aspect, contentMode: .fit)
            .overlay {
                GeometryReader { geo in
                    let w = geo.size.width / CGFloat(d.cols), h = geo.size.height / CGFloat(d.rows)
                    let total = d.count
                    let cellOf = cellMap(model.state.board)
                    ZStack(alignment: .topLeading) {
                        Rectangle().fill(Web.bg)
                        if model.ready {
                            ForEach(0..<total, id: \.self) { id in
                                let isGhost = id == total - 1
                                let cell = cellOf[id]
                                let at = cell ?? total - 1
                                tile(id: id, cell: cell, isGhost: isGhost, complete: complete, w: w, h: h, gap: gap)
                                    .offset(x: CGFloat(at % d.cols) * w, y: CGFloat(at / d.cols) * h)
                            }
                        }
                    }
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipShape(RoundedRectangle(cornerRadius: complete ? 0 : 3))
                    .shadow(color: .black.opacity(complete ? 0.25 : 0), radius: 12, y: 6)
                    .animation(.smooth(duration: model.tileAnimationDuration), value: model.state.board)
                    .animation(.easeInOut(duration: 0.5), value: complete)
                    .contentShape(Rectangle())
                    .gesture(drag(w: w, h: h, cols: d.cols, rows: d.rows))
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel(app.t("ios.art.board", ["cols": d.cols, "rows": d.rows]))
                }
            }
            .overlay { if !model.ready { ProgressView().controlSize(.large) } }
    }

    private func cellMap(_ b: ArtBoard) -> [Int: Int] {
        var m: [Int: Int] = [:]
        for (cell, t) in b.enumerated() { if let t { m[t] = cell } }
        return m
    }

    @ViewBuilder
    private func tile(id: Int, cell: Int?, isGhost: Bool, complete: Bool, w: CGFloat, h: CGFloat, gap: CGFloat) -> some View {
        if id < model.tiles.count {
            Image(uiImage: model.tiles[id])
                .resizable()
                .interpolation(.medium)
                .frame(width: max(1, w - gap * 2), height: max(1, h - gap * 2))
                .clipShape(RoundedRectangle(cornerRadius: complete ? 0 : 1.5))
                .overlay(alignment: .topLeading) {
                    if showNumbers && !isGhost {
                        Text("\(id + 1)")
                            .font(.system(size: 11, weight: .heavy)).foregroundStyle(.white)
                            .padding(.horizontal, 4).frame(minWidth: 18, minHeight: 18)
                            .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 4))
                            .padding(.leading, 4).padding(.top, 3)
                    }
                }
                .frame(width: w, height: h)
                .opacity(isGhost && !complete ? 0 : 1)
                .animation(isGhost ? .easeIn(duration: 0.9).delay(0.25) : nil, value: complete)
                .accessibilityHidden(isGhost && !complete)
                .accessibilityLabel(app.t("ios.art.tile", ["n": id + 1]))
                .accessibilityAddTraits(cell != nil && !isGhost ? .isButton : [])
                .accessibilityAction { if let cell { model.tap(cell) } }
        }
    }

    private func drag(w: CGFloat, h: CGFloat, cols: Int, rows: Int) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onEnded { v in
                let c = Int(v.startLocation.x / w), r = Int(v.startLocation.y / h)
                guard c >= 0, c < cols, r >= 0, r < rows else { return }
                let cell = r * cols + c
                let dx = v.translation.width, dy = v.translation.height
                if max(abs(dx), abs(dy)) < 22 { model.tap(cell); return }
                model.swipe(cell, abs(dx) > abs(dy) ? (dx > 0 ? .right : .left) : (dy > 0 ? .down : .up))
            }
    }
}
