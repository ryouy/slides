import SwiftUI
import UIKit
import SlideCore

private struct SendableImages: @unchecked Sendable { let list: [UIImage] }

/// One running puzzle: the rules live in SlideCore (`ArtState`); this class adds timing, animation, shuffling, saving and haptics.
@MainActor @Observable
final class ArtGameModel {
    private(set) var state: ArtState
    private(set) var tiles: [UIImage] = []        // by tile id; empty until the picture is prepared
    /// One slide, the same as the web's (217 ms, cubic-bezier .22 .8 .2 1).
    static let moveDuration = 0.217
    private(set) var shuffling = false
    private(set) var lineMoving = false
    private(set) var tileAnimationDuration = ArtGameModel.moveDuration
    var showResult = false
    /// The running clock. It lives apart from `state` on purpose: ticking `state` every 200 ms made the whole board rebuild five times
    /// a second (jank while tiles slide). `state.elapsedMs` catches up whenever the board changes, is saved or is cleared.
    private(set) var clockMs: Int
    var outcome: ArtSave.ClearOutcome?
    let daily: Bool
    let image: UIImage

    var onProgress: (ArtState) -> Void = { _ in }
    var onFlush: () -> Void = {}
    var onCleared: (ArtState) -> ArtSave.ClearOutcome = { _ in .init(newBestTime: false, newBestMoves: false, firstClear: false) }

    private var recorded: Bool
    private var shuffleTask: Task<Void, Never>?
    private var rewindTask: Task<Void, Never>?
    private var pendingPlan: ArtGenerator.ReshufflePlan?
    private var lastTick: Date?
    var paused = false { didSet { lastTick = nil } }

    init(state: ArtState, image: UIImage, daily: Bool) {
        self.state = state; self.image = image; self.daily = daily
        clockMs = state.elapsedMs
        recorded = state.cleared
        showResult = state.cleared
    }

    var ready: Bool { !tiles.isEmpty }
    var locked: Bool { !ready || state.cleared || shuffling || lineMoving }

    // MARK: picture -> tiles (done off the main thread)
    func prepare() async {
        guard tiles.isEmpty else { return }
        let d = state.dims, img = image
        let result = await Task.detached(priority: .userInitiated) { SendableImages(list: ArtGameModel.slice(img, d)) }.value
        tiles = result.list
    }

    nonisolated static func slice(_ image: UIImage, _ d: Dims) -> [UIImage] {
        // one downscaled bitmap (max 1800 px) so even a huge painting costs little memory, then one crop per tile
        let px = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let fit = CustomPhotoRules.fitWithin(Int(px.width), Int(px.height), max: 1800)
        let f = UIGraphicsImageRendererFormat(); f.scale = 1; f.opaque = true
        let size = CGSize(width: fit.width, height: fit.height)
        let flat = UIGraphicsImageRenderer(size: size, format: f).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let cg = flat.cgImage else { return [] }
        var out: [UIImage] = []
        for id in 0..<d.count {
            let r = id / d.cols, c = id % d.cols
            let x0 = Int((Double(c) * Double(cg.width) / Double(d.cols)).rounded()), x1 = Int((Double(c + 1) * Double(cg.width) / Double(d.cols)).rounded())
            let y0 = Int((Double(r) * Double(cg.height) / Double(d.rows)).rounded()), y1 = Int((Double(r + 1) * Double(cg.height) / Double(d.rows)).rounded())
            guard let piece = cg.cropping(to: CGRect(x: x0, y: y0, width: max(1, x1 - x0), height: max(1, y1 - y0))) else { return [] }
            out.append(UIImage(cgImage: piece))
        }
        return out
    }

    // MARK: input
    func tap(_ cell: Int) {
        guard !locked else { return }
        let cells = Board.lineSlideCells(state.board, state.dims, cell)
        guard !cells.isEmpty else { return }
        if cells.count == 1 { change { _ = $0.move(cell) } }
        else {
            lineMoving = true
            change { _ = $0.lineMove(cell) }
            Task { try? await Task.sleep(for: .milliseconds(240)); lineMoving = false; afterChange() }
        }
        Haptics.slide()
    }

    /// A drag on a tile counts when it points the way the tile would slide.
    func swipe(_ cell: Int, _ dir: ArtDirection) {
        guard !locked, Board.slideDirection(state.board, state.dims, cell) == dir else { return }
        tap(cell)
    }

    private func syncClock() { if state.elapsedMs != clockMs { state.elapsedMs = clockMs } }

    private func change(_ f: (inout ArtState) -> Void) {
        syncClock()
        tileAnimationDuration = Self.moveDuration
        withAnimation(.timingCurve(0.22, 0.8, 0.2, 1, duration: tileAnimationDuration)) { f(&state) }
        afterChange()
    }

    private func afterChange() {
        if shuffling { return }
        onProgress(state)
        if state.cleared && !recorded && !lineMoving {
            recorded = true
            outcome = onCleared(state)
            Haptics.success()
            Task { try? await Task.sleep(for: .milliseconds(1100)); if state.cleared { showResult = true } }
        }
    }

    func tick() {
        let now = Date()
        defer { lastTick = now }
        guard !paused, !shuffling, let last = lastTick, state.started, !state.cleared else { return }
        clockMs += Int(min(now.timeIntervalSince(last), 1.0) * 1000) // a long gap (app suspended) is never counted
    }

    /// Saves now (called when the app goes to the background or the screen closes).
    func flush() {
        if shuffling { finishShuffleNow() }
        syncClock()
        onProgress(state)
        onFlush()
    }

    // MARK: shuffle (real sliding, from what is on screen; the result is always solvable)
    func shuffle(reduceMotion: Bool) {
        guard !shuffling else { return }
        showResult = false
        let plan = ArtGenerator.planReshuffle(state, seed: "\(Date().timeIntervalSince1970)-\(Double.random(in: 0..<1))")
        recorded = false
        outcome = nil
        if reduceMotion {
            state = ArtState(puzzle: plan.puzzle); clockMs = state.elapsedMs; onProgress(state); return
        }
        shuffling = true
        pendingPlan = plan
        let step = ArtGenerator.visibleShuffleStep(state.dims)
        tileAnimationDuration = step * 0.92
        rewindClock(over: max(0.9, Double(plan.clicks.count) * step + 0.06 + max(0.08, step * 2)))
        shuffleTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(60))
            for c in plan.clicks {
                guard let self, !Task.isCancelled else { return }
                withAnimation(.easeInOut(duration: step * 0.92)) { _ = self.state.slideStep(c) }
                Haptics.slide()
                try? await Task.sleep(for: .seconds(step))
            }
            try? await Task.sleep(for: .seconds(max(0.08, step * 2)))
            self?.finishShuffleNow()
        }
    }

    /// The timer runs back to 0:00 while the pieces shuffle, tick by tick (it eases out as it nears zero).
    private func rewindClock(over duration: Double) {
        rewindTask?.cancel()
        let from = clockMs
        guard from > 0 else { return }
        rewindTask = Task { [weak self] in
            let t0 = Date()
            while !Task.isCancelled {
                let p = min(1, Date().timeIntervalSince(t0) / duration)
                self?.clockMs = Int(Double(from) * (1 - (1 - pow(1 - p, 1.6))))
                if p >= 1 { break }
                try? await Task.sleep(for: .milliseconds(30))
            }
            if !Task.isCancelled { self?.clockMs = 0 }
        }
    }

    private func finishShuffleNow() {
        rewindTask?.cancel(); rewindTask = nil
        shuffleTask?.cancel(); shuffleTask = nil
        guard let plan = pendingPlan else { shuffling = false; return }
        pendingPlan = nil
        state = ArtState(puzzle: plan.puzzle)
        clockMs = state.elapsedMs
        shuffling = false
        tileAnimationDuration = Self.moveDuration
        onProgress(state)
    }
}
