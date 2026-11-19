import SwiftUI

/// Shown for a moment at launch: the icon's painting, cut into 3×3, slides itself into place, then fades out.
struct SplashView: View {
    var onDone: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The blank's walk through the board (each step is one slide). The puzzle starts after the walk and is played back to solved.
    private static let n = 5
    private static let walk = [24, 23, 22, 17, 18, 19, 14, 13, 12, 7, 8, 9, 4, 3, 2, 1, 6, 11]
    @State private var cellOf: [Int]        // tile → cell
    @State private var complete = false
    @State private var fade = false
    @State private var started = false

    init(onDone: @escaping () -> Void) {
        self.onDone = onDone
        var board = Array(0..<(Self.n * Self.n))            // cell → tile
        var blank = Self.walk[0]
        for next in Self.walk.dropFirst() { board.swapAt(blank, next); blank = next }
        var c = Array(repeating: 0, count: Self.n * Self.n)
        for (cell, tile) in board.enumerated() { c[tile] = cell }
        _cellOf = State(initialValue: c)
    }

    var body: some View {
        GeometryReader { geo in
            let side = min(min(geo.size.width, geo.size.height) * 0.56, 300)
            let gap: CGFloat = complete ? 0 : 2
            let n = CGFloat(Self.n), t = (side - gap * (n - 1)) / n, last = Self.n * Self.n - 1
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
                                .opacity(tile == last && !complete ? 0 : 1)
                                .offset(x: CGFloat(cell % Self.n) * (t + gap), y: CGFloat(cell / Self.n) * (t + gap))
                        }
                    }
                    .frame(width: side, height: side, alignment: .topLeading)
                    .clipShape(RoundedRectangle(cornerRadius: side * 0.1, style: .continuous))
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
        try? await Task.sleep(for: .milliseconds(350))
        var blank = Self.walk.last!
        for next in Self.walk.reversed().dropFirst() {
            guard let tile = cellOf.firstIndex(of: next) else { continue }
            withAnimation(.easeInOut(duration: 0.13)) { cellOf[tile] = blank }
            blank = next
            try? await Task.sleep(for: .milliseconds(150))
        }
        withAnimation(.easeOut(duration: 0.35)) { complete = true }
        try? await Task.sleep(for: .milliseconds(650))
        finish()
    }

    private func finish() {
        guard !fade else { return }
        withAnimation(.easeIn(duration: 0.3)) { fade = true }
        Task { try? await Task.sleep(for: .milliseconds(300)); onDone() }
    }
}
