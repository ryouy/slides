import SwiftUI

/// Shown for a moment at launch. It starts on the app icon's picture (Mona Lisa's face in 5x5 tiles, scrambled, one tile missing),
/// the tiles slide to their places one after another, and the face is whole. Then it fades out.
struct SplashView: View {
    var onDone: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private static let n = 5
    /// cell -> tile of the first frame. Must match START in ios/scripts/make-app-icon.mjs (that script draws the app icon from it).
    private static let start = [14, 6, 21, 9, 2, 17, 11, 3, 19, 0, 8, 23, 5, 15, 12, 1, 22, 7, 13, 20, 4, 10, 24, 16, 18]
    @State private var cellOf: [Int]        // tile -> cell
    @State private var complete = false
    @State private var fade = false
    @State private var started = false

    init(onDone: @escaping () -> Void) {
        self.onDone = onDone
        var c = Array(repeating: 0, count: Self.n * Self.n)
        for (cell, tile) in Self.start.enumerated() { c[tile] = cell }
        _cellOf = State(initialValue: c)
    }

    var body: some View {
        GeometryReader { geo in
            let side = min(min(geo.size.width, geo.size.height) * 0.62, 340)
            let n = CGFloat(Self.n), last = Self.n * Self.n - 1
            let gap: CGFloat = complete ? 0 : side * 0.008
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
                                .clipShape(RoundedRectangle(cornerRadius: complete ? 0 : side * 0.018, style: .continuous))
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
        try? await Task.sleep(for: .milliseconds(450))   // a beat on the icon's picture
        // every tile glides to its place, the top-left ones first
        for tile in 0..<(Self.n * Self.n) {
            withAnimation(.timingCurve(0.3, 0, 0.2, 1, duration: 0.5).delay(Double(tile) * 0.03)) { cellOf[tile] = tile }
        }
        try? await Task.sleep(for: .milliseconds(Int(0.5 * 1000 + Double(Self.n * Self.n) * 30) + 80))
        withAnimation(.easeOut(duration: 0.45)) { complete = true }
        try? await Task.sleep(for: .milliseconds(1000))  // the face, whole
        finish()
    }

    private func finish() {
        guard !fade else { return }
        withAnimation(.easeIn(duration: 0.3)) { fade = true }
        Task { try? await Task.sleep(for: .milliseconds(300)); onDone() }
    }
}
