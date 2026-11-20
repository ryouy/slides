import SwiftUI

/// Shown for a moment at launch. It starts on the app icon's picture (Mona Lisa's face in 5x5 tiles, scrambled, one tile missing),
/// the tiles slide to their places one after another, and the face is whole. Then it fades out.
struct SplashView: View {
    var onDone: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private static let n = 5
    /// The blank's walk from the solved picture (tile 24, the last one, is the blank). The first frame is the picture after this walk, so it is
    /// still clearly the face; the animation plays the walk backwards, one real slide at a time, like the game. The icon is drawn from the same
    /// walk (WALK in ios/scripts/make-app-icon.mjs): keep the two identical.
    private static let walk = [24, 23, 18, 17, 22, 21, 16, 15, 10, 11, 6, 7, 12, 13, 18, 19, 14, 13, 8, 9, 4, 3, 8, 13, 12, 7, 6]
    @State private var cellOf: [Int]        // tile -> cell
    @State private var complete = false
    @State private var fade = false
    @State private var started = false

    init(onDone: @escaping () -> Void) {
        self.onDone = onDone
        var c = Array(0..<(Self.n * Self.n))   // tile -> cell, solved
        var blank = Self.walk[0]
        for next in Self.walk.dropFirst() {
            if let tile = c.firstIndex(of: next) { c[tile] = blank }   // the tile on the next cell slides into the blank
            blank = next
        }
        _cellOf = State(initialValue: c)
    }

    var body: some View {
        GeometryReader { geo in
            let side = min(min(geo.size.width, geo.size.height) * 0.62, 340)
            let n = CGFloat(Self.n), last = Self.n * Self.n - 1
            let gap: CGFloat = complete ? 0 : side * 0.006
            let t = (side - gap * (n - 1)) / n
            ZStack {
                Web.bg.ignoresSafeArea()
                VStack(spacing: 28) {
                    ZStack(alignment: .topLeading) {
                        ForEach(0..<(Self.n * Self.n), id: \.self) { tile in
                            let cell = cellOf[tile]
                            Image("SplashArt").resizable().scaledToFill()
                                .frame(width: side, height: side)
                                .offset(x: -CGFloat(tile % Self.n) * (side / n), y: -CGFloat(tile / Self.n) * (side / n))
                                .frame(width: side / n, height: side / n, alignment: .topLeading).clipped()
                                .frame(width: t, height: t, alignment: .topLeading).clipped()
                                .clipShape(RoundedRectangle(cornerRadius: complete ? 0 : t * 0.045, style: .continuous))
                                // a little polish: a faint light edge on top, a darker one below, and a soft shadow, so each piece reads as a tile
                                .overlay {
                                    RoundedRectangle(cornerRadius: t * 0.045, style: .continuous)
                                        .strokeBorder(LinearGradient(colors: [.white.opacity(0.28), .clear, .black.opacity(0.32)], startPoint: .top, endPoint: .bottom), lineWidth: max(0.6, t * 0.012))
                                        .opacity(complete ? 0 : 1)
                                }
                                .shadow(color: .black.opacity(complete ? 0 : 0.30), radius: t * 0.03, x: 0, y: t * 0.018)
                                .opacity(tile == last && !complete ? 0 : 1)
                                .offset(x: CGFloat(cell % Self.n) * (t + gap), y: CGFloat(cell / Self.n) * (t + gap))
                        }
                    }
                    .frame(width: side, height: side, alignment: .topLeading)
                    .shadow(color: .black.opacity(complete ? 0.28 : 0), radius: 18, y: 8)
                    Text("ART SLIDE").font(Web.font(22, .light, relativeTo: .title2)).tracking(8).padding(.leading, 8).foregroundStyle(Web.fg)
                }
                .scaleEffect(fade ? 1.04 : 1)
            }
            .opacity(fade ? 0 : 1)
        }
        .accessibilityHidden(true)
        .contentShape(Rectangle())
        .onTapGesture { finish() }
        .task { await run() }
    }

    private func run() async {
        guard !started else { return }
        started = true
        if reduceMotion {
            cellOf = Array(0..<(Self.n * Self.n)); complete = true
            try? await Task.sleep(for: .milliseconds(600)); finish(); return
        }
        try? await Task.sleep(for: .milliseconds(400))   // a beat on the first frame
        // the walk backwards: each step one tile slides into the blank, with the game's own easing
        var blank = Self.walk.last!
        for next in Self.walk.reversed().dropFirst() {
            guard let tile = cellOf.firstIndex(of: next) else { continue }
            withAnimation(.timingCurve(0.22, 0.8, 0.2, 1, duration: 0.096)) { cellOf[tile] = blank }
            blank = next
            try? await Task.sleep(for: .milliseconds(70))
        }
        try? await Task.sleep(for: .milliseconds(120))
        withAnimation(.easeOut(duration: 0.36)) { complete = true }
        try? await Task.sleep(for: .milliseconds(800))  // the face, whole
        finish()
    }

    private func finish() {
        guard !fade else { return }
        withAnimation(.easeIn(duration: 0.3)) { fade = true }
        Task { try? await Task.sleep(for: .milliseconds(300)); onDone() }
    }
}
