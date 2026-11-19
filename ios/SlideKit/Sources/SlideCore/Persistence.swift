import Foundation

/// Saves one Codable value as a JSON file in Application Support (not in the web-view-style storage that the OS may clear).
/// Writes are atomic and the previous good copy is kept as `<name>.bak`; a damaged file falls back to the backup, then to the default,
/// so a failed save or a corrupt file can never crash the app or lose more than the last change.
public final class JSONFileStore<T: Codable>: @unchecked Sendable {
    private let url: URL
    private let backup: URL
    private let lock = NSLock()

    public init(name: String, directory: URL? = nil) {
        let dir = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Records", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.url = dir.appendingPathComponent("\(name).json")
        self.backup = dir.appendingPathComponent("\(name).json.bak")
    }

    public func load() -> T? {
        lock.lock(); defer { lock.unlock() }
        for u in [url, backup] {
            if let d = try? Data(contentsOf: u), let v = try? JSONDecoder().decode(T.self, from: d) { return v }
        }
        return nil
    }

    @discardableResult
    public func save(_ value: T) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? JSONEncoder().encode(value) else { return false }
        if FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.removeItem(at: backup)
            try? FileManager.default.copyItem(at: url, to: backup)
        }
        do { try data.write(to: url, options: [.atomic]); return true } catch { return false }
    }
}
