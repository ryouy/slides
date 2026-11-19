import UIKit
import CryptoKit
import SlideCore

/// Painting images. Thumbnails (all paintings) and the full-size FREE paintings are bundled in the app; a Premium painting's full-size
/// image is downloaded once through the Worker (which re-verifies the Apple-signed transaction) and kept in Application Support.
@MainActor @Observable
public final class ImageStore {
    public enum DownloadError: Error { case notPremium, offline, http(Int), hash, io }

    public private(set) var downloaded: Set<String> = []
    public private(set) var totalBytes = 0
    private let catalog: ArtCatalog
    private let cache = NSCache<NSString, UIImage>()
    private var manifest: [String: (bytes: Int, sha256: String)] = [:]

    private let dir: URL = {
        var u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("ArtDownloads", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        var v = URLResourceValues(); v.isExcludedFromBackup = true // re-downloadable: not part of the iCloud backup
        try? u.setResourceValues(v)
        return u
    }()
    private var apiBase: String {
        (Bundle.main.object(forInfoDictionaryKey: "SlidesAPIBase") as? String).flatMap { $0.hasPrefix("$(") || $0.isEmpty ? nil : $0 } ?? "https://slides.ryouy.workers.dev"
    }

    init(catalog: ArtCatalog) {
        self.catalog = catalog
        cache.countLimit = 60
        if let d = try? Data(contentsOf: AppPaths.publicURL.appendingPathComponent("artworks/manifest.json")),
           let m = try? JSONDecoder().decode([String: ManifestEntry].self, from: d) {
            manifest = m.mapValues { ($0.bytes, $0.sha256) }
        }
    }
    private struct ManifestEntry: Decodable { let bytes: Int; let sha256: String }

    private func bundled(_ name: String) -> URL { AppPaths.publicURL.appendingPathComponent("artworks/\(name).webp") }
    private func downloadedFile(_ id: String) -> URL { dir.appendingPathComponent("\(id).webp") }
    private static func validID(_ id: String) -> Bool { !id.isEmpty && id.count <= 120 && id.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" } }

    public func refresh() async {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        let webps = files.filter { $0.pathExtension == "webp" }
        downloaded = Set(webps.map { $0.deletingPathExtension().lastPathComponent })
        totalBytes = webps.reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    }

    public func thumbnail(_ id: String) -> UIImage? { load("\(id)-thumb", at: bundled("\(id)-thumb")) }

    /// The full-size image if it is on the device (bundled free painting or downloaded Premium painting).
    public func fullImage(_ id: String) -> UIImage? {
        if catalog.isFree(id) { return load(id, at: bundled(id)) }
        if downloaded.contains(id) { return load(id, at: downloadedFile(id)) }
        return nil
    }
    public func isAvailableOffline(_ id: String) -> Bool { catalog.isFree(id) || downloaded.contains(id) }

    private func load(_ key: String, at url: URL) -> UIImage? {
        if let c = cache.object(forKey: key as NSString) { return c }
        guard let img = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(img, forKey: key as NSString)
        return img
    }

    public func delete(_ id: String) async {
        guard Self.validID(id) else { return }
        try? FileManager.default.removeItem(at: downloadedFile(id))
        cache.removeObject(forKey: id as NSString)
        await refresh()
    }
    public func deleteAll() async {
        for id in downloaded { try? FileManager.default.removeItem(at: downloadedFile(id)) }
        cache.removeAllObjects()
        await refresh()
    }

    /// Fetches a Premium painting. `progress` is 0…1. Throws `DownloadError`; a failed or cancelled download leaves nothing behind.
    public func download(_ id: String, premium: PremiumStore, progress: @escaping @MainActor (Double) -> Void) async throws {
        guard Self.validID(id), let token = premium.signedTransaction, premium.isPremium else { throw DownloadError.notPremium }
        guard let url = URL(string: "\(apiBase)/api/apple/artwork/\(id)"), url.scheme == "https" else { throw DownloadError.io }
        var req = URLRequest(url: url, timeoutInterval: 60)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (bytes, resp): (URLSession.AsyncBytes, URLResponse)
        do { (bytes, resp) = try await URLSession.shared.bytes(for: req) } catch { throw DownloadError.offline }
        guard let http = resp as? HTTPURLResponse else { throw DownloadError.io }
        guard http.statusCode == 200 else { throw DownloadError.http(http.statusCode) }
        let total = Double(max(http.expectedContentLength, manifest[id].map { Int64($0.bytes) } ?? 1, 1))
        var data = Data(), hasher = SHA256(), got = 0.0, chunk = Data()
        do {
            for try await b in bytes {
                chunk.append(b); got += 1
                if chunk.count >= 65536 { data.append(chunk); hasher.update(data: chunk); chunk.removeAll(keepingCapacity: true); progress(min(got / total, 1)) }
            }
        } catch { throw DownloadError.offline }
        if !chunk.isEmpty { data.append(chunk); hasher.update(data: chunk) }
        let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        if let want = manifest[id]?.sha256, want != digest { throw DownloadError.hash }
        do { try data.write(to: downloadedFile(id), options: .atomic) } catch { throw DownloadError.io }
        progress(1)
        await refresh()
    }
}
