import Foundation

public extension Notification.Name {
    /// Posted (on the main thread) by the games after a successful save of their records file; the sync debounces on it.
    static let slideRecordsChanged = Notification.Name("SlideRecordsChanged")
    /// Posted after a sync changed the records on disk; the live stores reload their records (never their unfinished puzzle).
    static let slideRecordsReloaded = Notification.Name("SlideRecordsReloaded")
}

public struct RemoteSync: Equatable, Sendable {
    public var version: Int
    public var doc: String?
    public init(version: Int, doc: String?) { self.version = version; self.doc = doc }
}

public enum PushResult: Equatable, Sendable {
    case ok(version: Int)
    case conflict(RemoteSync)
}

public enum SyncError: Error, Equatable, Sendable {
    /// 401: the session is invalid or expired.
    case signinRequired
    /// The server holds a newer document format than this app understands.
    case newerSchema
    case corruptRemote
    /// Still conflicting after the allowed retries.
    case tooManyConflicts
    /// Anything else (offline, 5xx, 503 not_configured, bad answer): try again later.
    case unavailable
}

/// The network, behind a protocol so the orchestration is testable without a server. Implementations throw `SyncError`.
public protocol SyncTransport: Sendable {
    func fetch() async throws -> RemoteSync
    func push(baseVersion: Int, doc: String) async throws -> PushResult
}

/// The records on this device. Both calls happen on the main actor with no suspension in between, so a game saving at the same moment cannot interleave.
@MainActor
public protocol SyncLocalStore: AnyObject {
    func read() -> SyncDocument
    /// Writes the records of `doc` (not the unfinished puzzles / preferences). Returns false if a file could not be written.
    func write(_ doc: SyncDocument) -> Bool
}

public struct SyncResult: Equatable, Sendable {
    public var document: SyncDocument
    /// The local files were changed by the merge (the live stores must reload).
    public var changedLocal: Bool
    public var pushed: Bool
    public var version: Int
}

/// GET -> merge with local -> write merged locally -> PUT; on 409 merge the returned doc again and retry (at most `maxRetries`).
/// Local files are written only after the remote document decoded successfully, so a damaged or newer-format document never costs data.
@MainActor
public struct SyncEngine {
    public static let maxRetries = 3
    let transport: SyncTransport
    let local: SyncLocalStore

    public init(transport: SyncTransport, local: SyncLocalStore) { self.transport = transport; self.local = local }

    private static func decode(_ r: RemoteSync) throws -> SyncDocument? {
        guard let s = r.doc, !s.isEmpty else { return nil }
        do { return try SyncDocument.decode(s) }
        catch SyncDocument.DecodeError.newerSchema { throw SyncError.newerSchema }
        catch { throw SyncError.corruptRemote }
    }

    public func run() async throws -> SyncResult {
        var remote = try await transport.fetch()
        var changed = false
        for attempt in 0...Self.maxRetries {
            let remoteDoc = try Self.decode(remote)
            let mine = local.read()
            let merged = remoteDoc.map { SyncMerge.document(mine, $0) } ?? mine.normalized()
            if merged != mine {
                guard local.write(merged) else { throw SyncError.unavailable }
                changed = true
            }
            if let remoteDoc, remoteDoc == merged { // the server already has everything
                return SyncResult(document: merged, changedLocal: changed, pushed: false, version: remote.version)
            }
            switch try await transport.push(baseVersion: remote.version, doc: merged.encode()) {
            case .ok(let v): return SyncResult(document: merged, changedLocal: changed, pushed: true, version: v)
            case .conflict(let r):
                if attempt == Self.maxRetries { throw SyncError.tooManyConflicts }
                remote = r
            }
        }
        throw SyncError.tooManyConflicts
    }
}

/// Reads and writes the three records files (same names the games use). The directory can be given for tests.
@MainActor
public final class FileSyncLocalStore: SyncLocalStore {
    private let art: JSONFileStore<ArtSave>, word: JSONFileStore<WordSave>, big: JSONFileStore<BigSave>
    public init(directory: URL? = nil) {
        art = JSONFileStore(name: "art-save", directory: directory)
        word = JSONFileStore(name: "word-save", directory: directory)
        big = JSONFileStore(name: "big-save", directory: directory)
    }
    public func read() -> SyncDocument {
        SyncDocument(art: ArtRecords(art.load() ?? ArtSave()), word: WordRecords(word.load() ?? WordSave()), big: BigRecords(big.load() ?? BigSave()))
    }
    public func write(_ doc: SyncDocument) -> Bool { write(doc, force: false) }

    /// `force` writes even when the records equal what `read()` shows (and replaces, not merges, them).
    func write(_ doc: SyncDocument, force: Bool) -> Bool {
        let cur = read()
        var ok = true
        if force || doc.art != cur.art { var s = art.load() ?? ArtSave(); doc.art.apply(to: &s); ok = art.save(s) && ok }
        if force || doc.word != cur.word { var s = word.load() ?? WordSave(); doc.word.apply(to: &s); ok = word.save(s) && ok }
        if force || doc.big != cur.big { var s = big.load() ?? BigSave(); doc.big.apply(to: &s); ok = big.save(s) && ok }
        return ok
    }
}
