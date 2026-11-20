import SwiftUI
import UIKit
import SlideCore

/// The ART SLIDE save file (progress, records, gallery preferences) as observable state. Saved after every meaningful change; never crashes.
@MainActor @Observable
final class ArtStore {
    private(set) var save: ArtSave
    private let file = JSONFileStore<ArtSave>(name: "art-save")
    @ObservationIgnored private var reloadObserver: RecordsReloadObserver?
    @ObservationIgnored private var progressDirty = false
    @ObservationIgnored private var writer: Task<Void, Never>?
    @ObservationIgnored private let ioQueue = DispatchQueue(label: "art-save-io", qos: .utility)

    init() {
        var s = file.load() ?? ArtSave()
        if s.ensureDriveFields() { file.save(s) } // this install's id for Drive sync is created once and kept
        save = s
        reloadObserver = RecordsReloadObserver { [weak self] in self?.reloadFromDisk() }
    }

    /// After a sync merged records into the file: take records only.  An
    /// unfinished puzzle, gallery preferences and local photo records stay in
    /// memory, while Drive's per-device counters are preserved for the next
    /// conflict-safe merge.
    func reloadFromDisk() {
        guard let d = file.load() else { return }
        ArtRecords(d).apply(to: &save)
        save.counters = d.counters
        save.keyClears = d.keyClears
        if save.deviceId.isEmpty { save.deviceId = d.deviceId }
    }

    func update(_ f: (inout ArtSave) -> Void) {
        f(&save); progressDirty = false
        let snapshot = save, file = file
        if ioQueue.sync(execute: { file.save(snapshot) }) { NotificationCenter.default.post(name: .slideRecordsChanged, object: nil) }
    }

    func setProgress(daily: Bool, _ s: ArtState?) {
        // The progress of a running puzzle is kept in memory at once and written to disk a moment later, off the main thread:
        // writing the whole save file (encode, backup copy, atomic write) on every tap stalled the slide animation.
        if daily { save.inProgressDaily = s } else { save.inProgressFree = s }
        progressDirty = true
        guard writer == nil else { return }
        writer = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(700))
            guard let self else { return }
            self.writer = nil
            guard self.progressDirty else { return }
            self.progressDirty = false
            let snapshot = self.save, f = self.file
            self.ioQueue.async { f.save(snapshot) }   // one serial queue for every write: a later snapshot can never be overtaken by an earlier one
        }
    }

    /// Writes any pending progress now (app goes to the background, the screen closes).
    func flushProgress() {
        writer?.cancel(); writer = nil
        guard progressDirty else { return }
        progressDirty = false
        let snapshot = save, f = file
        _ = ioQueue.sync { f.save(snapshot) }
    }

    @discardableResult
    func recordClear(_ s: ArtState, dateKey: String) -> ArtSave.ClearOutcome {
        var out = ArtSave.ClearOutcome(newBestTime: false, newBestMoves: false, firstClear: false)
        update { out = $0.recordClear(s, dateKey: dateKey) }
        return out
    }
}

struct CustomPhoto: Codable, Identifiable, Hashable, Sendable {
    var id: String; var name: String; var createdAt: Double; var width: Int; var height: Int; var bytes: Int
    var artworkID: String { CustomPhotoRules.artworkID(id) }
}

/// "My Photos": re-encoded JPEG files (EXIF stripped, downscaled) in Application Support/CustomPhotos with a small index. Never uploaded or synced.
@MainActor @Observable
final class CustomPhotoStore {
    enum Failure: Error { case decode, tooLarge, limit, quota, storage }

    private(set) var photos: [CustomPhoto] = []
    private let index: JSONFileStore<[CustomPhoto]>
    private let dir: URL
    private let cache = NSCache<NSString, UIImage>()

    init() {
        var d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("CustomPhotos", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        var v = URLResourceValues(); v.isExcludedFromBackup = true
        try? d.setResourceValues(v)
        dir = d
        index = JSONFileStore<[CustomPhoto]>(name: "index", directory: d)
        // keep only entries whose files still exist
        photos = (index.load() ?? []).filter { FileManager.default.fileExists(atPath: d.appendingPathComponent("\($0.id).jpg").path) }.sorted { $0.createdAt > $1.createdAt }
    }

    var usedBytes: Int { photos.reduce(0) { $0 + $1.bytes } }
    func photo(artworkID: String) -> CustomPhoto? { let id = CustomPhotoRules.photoID(artworkID); return photos.first { $0.id == id } }
    func image(_ p: CustomPhoto) -> UIImage? { load("\(p.id).jpg") }
    func thumb(_ p: CustomPhoto) -> UIImage? { load("\(p.id)-thumb.jpg") }
    private func load(_ name: String) -> UIImage? {
        if let c = cache.object(forKey: name as NSString) { return c }
        guard let i = UIImage(contentsOfFile: dir.appendingPathComponent(name).path) else { return nil }
        cache.setObject(i, forKey: name as NSString); return i
    }

    /// Shrinks and re-encodes one picture (drawing again drops all metadata such as location) and stores it.
    func add(data: Data, name: String) async throws {
        guard data.count <= CustomPhotoRules.maxInputBytes else { throw Failure.tooLarge }
        if let p = CustomPhotoRules.limitProblem(count: photos.count, usedBytes: usedBytes, extraBytes: 0) { throw p == .limit ? Failure.limit : Failure.quota }
        let encoded: (main: Data, thumb: Data, w: Int, h: Int)? = await Task.detached(priority: .userInitiated) {
            guard let img = UIImage(data: data), img.size.width > 0, img.size.height > 0 else { return nil }
            func render(_ maxSide: Int) -> (Data, Int, Int)? {
                let px = CGSize(width: img.size.width * img.scale, height: img.size.height * img.scale)
                let fit = CustomPhotoRules.fitWithin(Int(px.width), Int(px.height), max: maxSide)
                let f = UIGraphicsImageRendererFormat(); f.scale = 1; f.opaque = true
                let r = UIGraphicsImageRenderer(size: CGSize(width: fit.width, height: fit.height), format: f)
                let out = r.image { _ in img.draw(in: CGRect(x: 0, y: 0, width: fit.width, height: fit.height)) } // honours the orientation
                guard let jpg = out.jpegData(compressionQuality: 0.86) else { return nil }
                return (jpg, fit.width, fit.height)
            }
            guard let m = render(CustomPhotoRules.maxSide), let t = render(CustomPhotoRules.thumbSide) else { return nil }
            return (m.0, t.0, m.1, m.2)
        }.value
        guard let e = encoded else { throw Failure.decode }
        let bytes = e.main.count + e.thumb.count
        if let p = CustomPhotoRules.limitProblem(count: photos.count, usedBytes: usedBytes, extraBytes: bytes) { throw p == .limit ? Failure.limit : Failure.quota }
        let id = UUID().uuidString.lowercased()
        do {
            try e.main.write(to: dir.appendingPathComponent("\(id).jpg"), options: .atomic)
            try e.thumb.write(to: dir.appendingPathComponent("\(id)-thumb.jpg"), options: .atomic)
        } catch { throw Failure.storage }
        photos.insert(CustomPhoto(id: id, name: String(name.prefix(60)).isEmpty ? "Photo" : String(name.prefix(60)), createdAt: Date().timeIntervalSince1970 * 1000, width: e.w, height: e.h, bytes: bytes), at: 0)
        index.save(photos)
    }

    func delete(_ p: CustomPhoto) {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(p.id).jpg"))
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(p.id)-thumb.jpg"))
        cache.removeObject(forKey: "\(p.id).jpg" as NSString); cache.removeObject(forKey: "\(p.id)-thumb.jpg" as NSString)
        photos.removeAll { $0.id == p.id }
        index.save(photos)
    }
}

/// What the game needs to know about a painting or one of the visitor's photos.
struct PlayArtwork: Equatable {
    var id: String
    var title: String
    var artist: String
    var year: String
    var width: Int
    var height: Int
    var artwork: Artwork?
    var isCustom: Bool { ArtRules.isCustom(id) }
    var aspect: Double { ArtGrid.aspect(width: width, height: height) }
    init(_ a: Artwork) { id = a.id; title = a.title; artist = a.artist; year = a.year; width = a.width; height = a.height; artwork = a }
    init(_ p: CustomPhoto) { id = p.artworkID; title = p.name; artist = ""; year = ""; width = p.width; height = p.height; artwork = nil }
}
