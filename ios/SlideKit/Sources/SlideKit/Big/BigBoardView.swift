import SwiftUI
import SlideCore

private let swipeThreshold: CGFloat = 22 // same as the web (SWIPE_PX)

/// Horizontal wobble for a blocked piece. Zero at progress 0 and 1, so the effect can simply toggle between them.
struct BigShake: GeometryEffect {
    var progress: CGFloat
    var animatableData: CGFloat { get { progress } set { progress = newValue } }
    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 7 * sin(progress * .pi * 6), y: 0))
    }
}

/// Draws one piece (number tile, rectangular block or shaped block) the way the web does. Also used, smaller, for the goal picture.
struct BigPieceShape: View {
    let piece: BigPiece
    let cell: CGFloat // size of one board cell
    var home = false
    var selected = false
    var mini = false
    var colorblind = false

    private var pad: CGFloat { mini ? 1 : 3 }
    private var w: CGFloat { CGFloat(piece.w) * cell - pad * 2 }
    private var h: CGFloat { CGFloat(piece.h) * cell - pad * 2 }

    var body: some View {
        Group {
            if piece.kind == .small { small } else if piece.isRect { rectBlock } else { shaped }
        }
        .frame(width: w, height: h)
    }

    private var homeColor: Color { BigTheme.home(colorblind) }

    private var small: some View {
        RoundedRectangle(cornerRadius: mini ? 4 : 10)
            .fill(BigTheme.tile)
            .overlay {
                if home && !mini { RoundedRectangle(cornerRadius: 10).strokeBorder(homeColor, lineWidth: 3) }
                if selected { RoundedRectangle(cornerRadius: 12).stroke(BigTheme.foundLine, lineWidth: 3).padding(-4) }
            }
            .overlay { Text(piece.label).font(Self.fixed(cell * (mini ? 0.42 : 0.4))).foregroundStyle(BigTheme.tileFg).minimumScaleFactor(0.5).lineLimit(1) }
    }

    private var rectBlock: some View {
        let radius: CGFloat = mini ? 7 : 16
        return RoundedRectangle(cornerRadius: radius)
            .fill(BigTheme.bigColor(piece.id))
            .overlay {
                if home && !mini { RoundedRectangle(cornerRadius: radius).strokeBorder(homeColor, lineWidth: 3) }
                if selected { RoundedRectangle(cornerRadius: radius + 2).stroke(BigTheme.foundLine, lineWidth: 3).padding(-4) }
            }
            .overlay {
                Text(piece.label)
                    .font(Self.fixed(cell * (0.26 * CGFloat(min(piece.w, piece.h)) + 0.04)))
                    .tracking(cell * 0.08 * 0.5)
                    .foregroundStyle(BigTheme.bigFg)
                    .minimumScaleFactor(0.5).lineLimit(1)
            }
    }

    /// Non-rectangular block: its cells are merged into one shape (gap only kept at notches).
    private var shaped: some View {
        let cells = piece.cells
        let has = Set(cells.map { $0.r * 16 + $0.c })
        let cw = w / CGFloat(piece.w), ch = h / CGFloat(piece.h)
        let gap: CGFloat = mini ? 1 : 3
        let radius: CGFloat = mini ? 5 : 14
        let color = BigTheme.bigColor(piece.id)
        let cr = Double(cells.reduce(0) { $0 + $1.r }) / Double(cells.count)
        let cc = Double(cells.reduce(0) { $0 + $1.c }) / Double(cells.count)
        let lab = cells.min { hypot(Double($0.r) - cr, Double($0.c) - cc) < hypot(Double($1.r) - cr, Double($1.c) - cc) }!
        let outline: Color? = selected ? BigTheme.foundLine : (home && !mini ? homeColor : nil)
        func rect(_ k: BigCell) -> (CGRect, UnevenRoundedRectangleShape) {
            let top = !has.contains((k.r - 1) * 16 + k.c), bottom = !has.contains((k.r + 1) * 16 + k.c)
            let left = !has.contains(k.r * 16 + k.c - 1), right = !has.contains(k.r * 16 + k.c + 1)
            func inset(_ outer: Bool, _ edge: Bool) -> CGFloat { outer && !edge ? gap : 0 }
            let t = inset(top, k.r == 0), r = inset(right, k.c == piece.w - 1), b = inset(bottom, k.r == piece.h - 1), l = inset(left, k.c == 0)
            let frame = CGRect(x: CGFloat(k.c) * cw + l, y: CGFloat(k.r) * ch + t, width: cw - l - r, height: ch - t - b)
            return (frame, UnevenRoundedRectangleShape(tl: top && left ? radius : 0, tr: top && right ? radius : 0, br: bottom && right ? radius : 0, bl: bottom && left ? radius : 0))
        }
        return ZStack(alignment: .topLeading) {
            if let outline {
                ForEach(cells, id: \.self) { k in
                    let (f, s) = rect(k)
                    s.stroke(outline, lineWidth: 5).frame(width: f.width, height: f.height).offset(x: f.minX, y: f.minY)
                }
            }
            ForEach(cells, id: \.self) { k in
                let (f, s) = rect(k)
                s.fill(color).overlay(s.stroke(color, lineWidth: 0.7)).frame(width: f.width, height: f.height).offset(x: f.minX, y: f.minY)
            }
            Text(piece.label)
                .font(Self.fixed(cell * (mini ? 0.45 : 0.5)))
                .foregroundStyle(BigTheme.bigFg)
                .frame(width: cw, height: ch)
                .offset(x: CGFloat(lab.c) * cw, y: CGFloat(lab.r) * ch)
        }
        .frame(width: w, height: h, alignment: .topLeading)
    }

    static func fixed(_ size: CGFloat) -> Font { .custom("HelveticaNeue-Bold", fixedSize: max(size, 6)) }
}

/// A rounded rectangle with a radius per corner (fill and stroke).
struct UnevenRoundedRectangleShape: Shape {
    var tl: CGFloat, tr: CGFloat, br: CGFloat, bl: CGFloat
    func path(in rect: CGRect) -> Path {
        UnevenRoundedRectangle(topLeadingRadius: tl, bottomLeadingRadius: bl, bottomTrailingRadius: br, topTrailingRadius: tr, style: .continuous).path(in: rect)
    }
}

/// The playing board: tap a piece to slide it (or pick an arrow when several directions fit) or drag/swipe it. Pieces glide with springs.
struct BigBoardView: View {
    let pieces: [BigPiece]
    let goal: [BigPiece]
    let n: Int
    let selectedId: Int?
    let selectedDirs: [BigDirection]
    let shake: (id: Int, tick: Int)?
    let disabled: Bool
    let colorblind: Bool
    let label: (BigPiece) -> String
    let dirLabel: (BigPiece, BigDirection) -> String
    let onTap: (Int) -> Void
    let onMove: (Int, BigDirection) -> Void
    let legal: (Int) -> [BigDirection]

    @State private var dragId: Int?
    @State private var dragOffset: CGSize = .zero
    @State private var dragHit: Int?? = nil // nil = not started; .some(nil) = started on an empty cell

    private let pad: CGFloat = 6
    private let spring = Animation.spring(response: 0.3, dampingFraction: 0.78)

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let cell = (side - pad * 2) / CGFloat(n)
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 14).fill(BigTheme.surface)
                // empty slots
                ForEach(0..<(n * n), id: \.self) { i in
                    RoundedRectangle(cornerRadius: 8).fill(BigTheme.bg.opacity(0.55))
                        .frame(width: cell - 6, height: cell - 6)
                        .offset(x: pad + CGFloat(i % n) * cell + 3, y: pad + CGFloat(i / n) * cell + 3)
                }
                // pieces (stable order, so they animate and never remount)
                ZStack(alignment: .topLeading) {
                    ForEach(pieces.sorted { $0.id < $1.id }, id: \.id) { p in
                        let g = goal.first { $0.id == p.id }
                        pieceView(p, cell: cell, home: g.map { $0.r == p.r && $0.c == p.c } ?? false)
                    }
                }
                .contentShape(Rectangle())
                .gesture(dragGesture(cell: cell))
                // direction arrows of the selected piece, above the pieces
                if let sid = selectedId, let p = pieces.first(where: { $0.id == sid }) {
                    ForEach(selectedDirs, id: \.self) { d in arrow(p, d, cell: cell) }
                }
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(verbatim: "\(n)×\(n)"))
    }

    private func origin(_ p: BigPiece, cell: CGFloat) -> CGPoint {
        CGPoint(x: pad + CGFloat(p.c) * cell + 3, y: pad + CGFloat(p.r) * cell + 3)
    }

    private func pieceView(_ p: BigPiece, cell: CGFloat, home: Bool) -> some View {
        let o = origin(p, cell: cell)
        let dragging = dragId == p.id
        return BigPieceShape(piece: p, cell: cell, home: home, selected: selectedId == p.id, colorblind: colorblind)
            .modifier(BigShake(progress: shake?.id == p.id ? CGFloat(shake!.tick % 2) : 0))
            .offset(x: o.x, y: o.y)
            .animation(spring, value: p.r)
            .animation(spring, value: p.c)
            .offset(dragging ? dragOffset : .zero)
            .zIndex(dragging ? 2 : (p.kind == .big ? 1 : 0))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label(p))
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { if !disabled { onTap(p.id) } }
            .accessibilityActions {
                if !disabled { ForEach(legal(p.id), id: \.self) { d in Button(dirLabel(p, d)) { onMove(p.id, d) } } }
            }
    }

    private func arrow(_ p: BigPiece, _ d: BigDirection, cell: CGFloat) -> some View {
        let o = origin(p, cell: cell)
        let w = CGFloat(p.w) * cell - 6, h = CGFloat(p.h) * cell - 6
        let size: CGFloat = p.kind == .small ? 30 : 36
        let out: CGFloat = p.kind == .small ? 14 : 8 // how far the button sticks out of the piece (as on the web)
        let pos: CGPoint
        switch d {
        case .up: pos = CGPoint(x: o.x + w / 2, y: o.y - out + size / 2)
        case .down: pos = CGPoint(x: o.x + w / 2, y: o.y + h + out - size / 2)
        case .left: pos = CGPoint(x: o.x - out + size / 2, y: o.y + h / 2)
        case .right: pos = CGPoint(x: o.x + w + out - size / 2, y: o.y + h / 2)
        }
        let symbol = ["up": "arrowtriangle.up.fill", "down": "arrowtriangle.down.fill", "left": "arrowtriangle.left.fill", "right": "arrowtriangle.right.fill"][d.rawValue]!
        return Button { onMove(p.id, d) } label: {
            Image(systemName: symbol).font(.system(size: 13)).foregroundStyle(BigTheme.accentFg)
                .frame(width: size, height: size)
                .background(Circle().fill(BigTheme.accent))
                .overlay(Circle().strokeBorder(BigTheme.bg, lineWidth: 2))
                .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .position(pos)
        .zIndex(5)
        .accessibilityLabel(dirLabel(p, d))
        .transition(.scale(scale: 0.6).combined(with: .opacity))
    }

    // MARK: gesture

    private func pieceAt(_ pt: CGPoint, cell: CGFloat) -> Int? {
        let c = Int(floor((pt.x - pad) / cell)), r = Int(floor((pt.y - pad) / cell))
        guard r >= 0, c >= 0, r < n, c < n else { return nil }
        return pieces.first { p in p.cells.contains { p.r + $0.r == r && p.c + $0.c == c } }?.id
    }

    private func dirOf(_ t: CGSize) -> BigDirection {
        abs(t.width) > abs(t.height) ? (t.width > 0 ? .right : .left) : (t.height > 0 ? .down : .up)
    }

    private func dragGesture(cell: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { v in
                if dragHit == nil { dragHit = .some(pieceAt(v.startLocation, cell: cell)) }
                guard !disabled, let hit = dragHit, let id = hit else { return }
                let t = v.translation
                guard max(abs(t.width), abs(t.height)) > 3 else { return }
                let dir = dirOf(t)
                let proj = dir == .right ? t.width : dir == .left ? -t.width : dir == .down ? t.height : -t.height
                let dist: CGFloat = legal(id).contains(dir) ? min(proj, cell) : min(proj * 0.1, 8)
                let d = dir.delta
                dragId = id
                dragOffset = CGSize(width: CGFloat(d.dc) * dist, height: CGFloat(d.dr) * dist)
            }
            .onEnded { v in
                let hit = dragHit ?? nil
                dragHit = nil
                guard !disabled, let id = hit else { dragId = nil; dragOffset = .zero; return }
                let t = v.translation
                withAnimation(spring) {
                    if max(abs(t.width), abs(t.height)) < swipeThreshold { onTap(id) } else { onMove(id, dirOf(t)) }
                    dragId = nil
                    dragOffset = .zero
                }
            }
    }
}
