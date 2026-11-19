import SwiftUI
import SlideCore

/// State of WORD SLIDE: word list, save file, the daily and the endless game. Saves after every change (never crashes on a failed save).
@MainActor @Observable
final class WordModel {
    let catalog: WordCatalog?
    private(set) var save: WordSave
    private(set) var dailyKey: String
    private let store = JSONFileStore<WordSave>(name: "word-save")
    private var recorded: Set<String> = []
    private var lastTickSave = Date()
    @ObservationIgnored private var reloadObserver: RecordsReloadObserver?

    init(catalogURL: URL = AppPaths.publicURL.appendingPathComponent("data/word/words.json")) {
        catalog = try? WordCatalog(url: catalogURL)
        let today = DateKeys.jstDateKey()
        dailyKey = today
        var s = store.load() ?? WordSave()
        s.sanitize(wordsVersion: catalog?.version ?? "", today: today)
        save = s
        for g in [s.inProgress.daily, s.inProgress.endless] { if let g, g.status == .cleared { recorded.insert(g.puzzle.id) } }
        reloadObserver = RecordsReloadObserver { [weak self] in self?.reloadFromDisk() }
    }

    /// After a sync merged records into the file: take the records, never the unfinished puzzle.
    func reloadFromDisk() { if let d = store.load() { WordRecords(d).apply(to: &save) } }

    var today: String { DateKeys.jstDateKey() }

    func state(_ mode: WordMode) -> WordGameState? { mode == .daily ? save.inProgress.daily : save.inProgress.endless }
    private func set(_ mode: WordMode, _ s: WordGameState?) { if mode == .daily { save.inProgress.daily = s } else { save.inProgress.endless = s } }

    func persist() { if store.save(save) { NotificationCenter.default.post(name: .slideRecordsChanged, object: nil) } }

    /// Open (or resume) today's daily. The date is JST; a stale saved game is discarded.
    func openDaily() {
        let key = DateKeys.jstDateKey()
        dailyKey = key
        if let d = save.inProgress.daily, d.puzzle.id == "daily-\(key)" { return }
        save.inProgress.daily = nil
        if let catalog, let p = WordGenerator.daily(key, catalog: catalog) { save.inProgress.daily = WordGameState(puzzle: p); persist() }
    }

    func startEndless(_ d: WordDifficulty, keepStreak: Bool = true) {
        guard let catalog, let p = WordGenerator.endless(d, catalog: catalog) else { return }
        save.lastDifficulty = d
        if !keepStreak { save.endlessStreak = 0 }
        save.inProgress.endless = WordGameState(puzzle: p)
        persist()
    }

    /// Leaving an unsolved started puzzle behind breaks the endless streak.
    func abandonEndless() {
        if let cur = save.inProgress.endless, cur.status != .cleared, cur.started { save.endlessStreak = 0 }
        save.inProgress.endless = nil
        persist()
    }

    func apply(_ mode: WordMode, _ a: WordAction) {
        guard var s = state(mode) else { return }
        let wasCleared = s.status == .cleared
        guard s.apply(a) else { return }
        set(mode, s)
        if case .tick = a {
            if Date().timeIntervalSince(lastTickSave) > 5 { lastTickSave = Date(); persist() }
            return
        }
        if !wasCleared && s.status == .cleared { recordClear(mode, s) }
        persist()
    }

    private func recordClear(_ mode: WordMode, _ s: WordGameState) {
        guard recorded.insert(s.puzzle.id).inserted else { return }
        save.recordClear(.init(mode: mode, difficulty: s.puzzle.difficulty, dateKey: mode == .daily ? dailyKey : DateKeys.jstDateKey(), number: s.puzzle.number,
                               timeMs: s.elapsedMs, moves: s.moves, checks: s.checks, hints: s.hintUse.total, noHint: s.isNoHintClear))
    }
}
