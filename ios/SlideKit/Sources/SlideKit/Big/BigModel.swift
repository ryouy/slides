import SwiftUI
import SlideCore
import UIKit

/// State of the BIG SLIDE mini-game: the save file, the two games (daily / endless), timer and haptics.
@MainActor @Observable
final class BigModel {
    private let store = JSONFileStore<BigSave>(name: "big-save")
    private(set) var save: BigSave
    private(set) var daily: BigState?
    private(set) var endless: BigState?
    private(set) var generating = false
    private(set) var failed = false
    var showClear = false
    var shake: (id: Int, tick: Int)?
    private var lastTick: Date?
    private var clearTask: Task<Void, Never>?

    init() {
        var s = store.load() ?? BigSave()
        s.sanitize(today: DateKeys.jstDateKey())
        save = s
        endless = s.inProgress.endless
        daily = s.inProgress.daily
    }

    var today: String { DateKeys.jstDateKey() }

    // MARK: persistence

    private func persist() {
        save.inProgress.daily = daily
        save.inProgress.endless = endless
        store.save(save) // a failed write never crashes; the game keeps running in memory
    }

    func flush() { persist() }

    func state(_ mode: BigMode) -> BigState? { mode == .daily ? daily : endless }

    private func set(_ mode: BigMode, _ s: BigState?) {
        if mode == .daily { daily = s } else { endless = s }
    }

    // MARK: opening games

    /// Opens today's daily: resumes saved progress for the date, else builds the puzzle on a background thread.
    func openDaily() async {
        let key = today
        save.sanitize(today: key)
        if let d = daily, d.puzzle.id == "bigdaily-\(key)", d.puzzle.generatorVersion == bigGeneratorVersion {
            showClear = d.status == .cleared
            return
        }
        daily = nil
        showClear = false
        generating = true
        failed = false
        let puzzle = await Task.detached(priority: .userInitiated) { try? generateBigDaily(key) }.value
        generating = false
        if let puzzle { daily = BigState(puzzle: puzzle); persist() } else { failed = true }
    }

    func openEndless() { showClear = endless?.status == .cleared }

    func startEndless(variant: BigVariant, size: Int, difficulty: BigDifficulty) async {
        save.lastSize = size; save.lastDifficulty = difficulty; save.lastVariant = variant
        generating = true
        failed = false
        showClear = false
        let puzzle = await Task.detached(priority: .userInitiated) { try? generateBigEndless(size: size, difficulty: difficulty, variant: variant) }.value
        generating = false
        if let puzzle { endless = BigState(puzzle: puzzle) } else { failed = true }
        persist()
    }

    /// "NEW": leaves the endless game; giving up a started, unfinished game ends the streak (as on the web).
    func abandonEndless() {
        if let e = endless, e.status != .cleared, e.started { save.endlessStreak = 0 }
        endless = nil
        showClear = false
        persist()
    }

    func restart(_ mode: BigMode) {
        guard var s = state(mode) else { return }
        s.restart()
        set(mode, s)
        showClear = false
        persist()
    }

    // MARK: play

    func legalDirs(_ mode: BigMode, _ id: Int) -> [BigDirection] { state(mode)?.legalDirs(id) ?? [] }

    func tap(_ mode: BigMode, _ id: Int) {
        guard var s = state(mode), s.status == .playing else { return }
        let dirs = s.legalDirs(id)
        if dirs.count == 1 {
            apply(mode, id, dirs[0])
        } else if dirs.count > 1 {
            s.select(s.selected == id ? nil : id)
            set(mode, s)
            UISelectionFeedbackGenerator().selectionChanged()
        } else {
            blocked(mode, id)
        }
    }

    func move(_ mode: BigMode, _ id: Int, _ dir: BigDirection) {
        guard let s = state(mode), s.status == .playing else { return }
        if s.legalDirs(id).contains(dir) { apply(mode, id, dir) } else { blocked(mode, id) }
    }

    private func blocked(_ mode: BigMode, _ id: Int) {
        guard var s = state(mode) else { return }
        s.select(nil)
        set(mode, s)
        shake = (id, (shake?.tick ?? 0) + 1)
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    private func apply(_ mode: BigMode, _ id: Int, _ dir: BigDirection) {
        guard var s = state(mode) else { return }
        guard s.move(id: id, dir: dir) else { return }
        if lastTick == nil { lastTick = Date() }
        set(mode, s)
        if s.status == .cleared {
            save.recordClear(s, dateKey: today)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            clearTask?.cancel()
            clearTask = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(450))
                if !Task.isCancelled { self?.showClear = true }
            }
        } else {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
        persist()
    }

    // MARK: timer

    /// Called by the game screen about four times a second while it is on screen and the app is active.
    func tick(_ mode: BigMode, active: Bool) {
        let now = Date()
        defer { lastTick = active ? now : nil }
        guard active, let last = lastTick, var s = state(mode), s.status == .playing, s.started else { return }
        let ms = Int(now.timeIntervalSince(last) * 1000)
        guard ms > 0, ms < 5000 else { return }
        s.tick(ms: ms)
        set(mode, s)
    }

    func resetClock() { lastTick = nil }
}
