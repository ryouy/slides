import Foundation

public enum DriveRemote: Equatable, Sendable {
    case empty
    case doc(fileId: String, doc: DriveDoc)
    /// The file exists but was written by a newer app version (`newer`) or is not a records file: it must not be overwritten.
    case unreadable(fileId: String, newer: Bool)
}

public enum DriveTransportError: Error, Equatable, Sendable {
    /// The token was refused or lacks permission: the person has to connect again.
    case auth
    /// Offline or a server problem: safe to try again later.
    case unavailable
}

/// Google Drive's hidden appDataFolder file `slides-art-records.json`, behind a protocol so the round is testable without Google.
public protocol DriveTransport: Sendable {
    func read() async throws -> DriveRemote
    /// Creates the file when `fileId` is nil. Returns the file id.
    func write(_ doc: DriveDoc, fileId: String?) async throws -> String
}

@MainActor
public protocol DriveLocalStore: AnyObject {
    func read() -> ArtSave
    /// Applies `f` to the CURRENT records (so plays made while syncing are never lost). Returns false if the file could not be written.
    func update(_ f: (inout ArtSave) -> Void) -> Bool
}

public enum DriveOutcome: Equatable, Sendable {
    case ok(uploaded: Bool)
    case needsConsent
    case newerVersion
    case unreadable
    case error(retryable: Bool)
}

/// One round: read Drive, merge with the device, write the merged records locally, upload if Drive lacks something, then check once or twice that
/// nobody wrote in between. The device's records are written only after the document decoded, and are only ever added to.
@MainActor
public struct DriveSyncRunner {
    public static let maxRewrites = 2
    let transport: DriveTransport
    let local: DriveLocalStore
    public init(transport: DriveTransport, local: DriveLocalStore) { self.transport = transport; self.local = local }

    public func run() async -> DriveOutcome {
        do {
            var remote = try await transport.read()
            var uploaded = false
            for attempt in 0...Self.maxRewrites {
                var remoteDoc: DriveDoc?
                var fileId: String?
                switch remote {
                case .empty: break
                case .doc(let id, let d): remoteDoc = d; fileId = id
                case .unreadable(_, let newer): return newer ? .newerVersion : .unreadable
                }
                var merged = DriveDoc()
                let wrote = local.update { s in
                    merged = DriveDoc.merge(DriveRecords.toDoc(s), remoteDoc ?? DriveDoc())
                    s = DriveRecords.fromMerged(s, merged)
                }
                if !wrote { return .error(retryable: true) }
                if let remoteDoc, remoteDoc == merged { return .ok(uploaded: uploaded) }
                _ = try await transport.write(merged, fileId: fileId)
                uploaded = true
                if attempt == Self.maxRewrites { break }
                // someone else may have written between our read and our write: look again and merge what they added
                guard let after = try? await transport.read() else { break }
                if case .doc(_, let d) = after, d == merged { break }
                if case .empty = after { remote = after; continue }
                remote = after
            }
            return .ok(uploaded: uploaded)
        } catch DriveTransportError.auth { return .needsConsent }
        catch { return .error(retryable: true) }
    }
}

/// The ART save file on this device, read and written on the main actor in one step.
@MainActor
public final class FileDriveLocalStore: DriveLocalStore {
    private let file: JSONFileStore<ArtSave>
    public let directory: URL
    public static let backupName = "drive-switch-backup.json"
    public init(directory: URL? = nil) {
        let dir = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Records", isDirectory: true)
        self.directory = dir
        file = JSONFileStore(name: "art-save", directory: dir)
    }
    public func read() -> ArtSave { file.load() ?? ArtSave() }
    public func update(_ f: (inout ArtSave) -> Void) -> Bool {
        var s = read()
        let before = s
        s.ensureDriveFields()
        f(&s)
        return s == before ? true : file.save(s)
    }
    /// One-slot safety copy of the play records (overwritten by the next one).
    public func backupRecords() -> Bool {
        do { try DriveRecords.toDoc(read()).jsonData().write(to: directory.appendingPathComponent(Self.backupName), options: .atomic); return true } catch { return false }
    }
    public func backupDocument() -> DriveDoc? {
        (try? Data(contentsOf: directory.appendingPathComponent(Self.backupName))).flatMap { try? DriveDoc.parse($0) }
    }
    /// Adds the safety copy's records back (merge, so nothing newer is lost).
    public func restoreBackup() -> Bool {
        guard let b = backupDocument() else { return false }
        return update { s in s = DriveRecords.fromMerged(s, DriveDoc.merge(DriveRecords.toDoc(s), b)) }
    }
    public func resetRecords() -> Bool { update { $0 = DriveRecords.cleared($0) } }
    /// SHA-256 over the records as they would be uploaded: stable across orderings.
    public func digest() -> String { var s = read(); s.ensureDriveFields(); return SyncOwnership.digest(raw: DriveRecords.toDoc(s).jsonString()) }
}

public enum DriveAccountSwitch {
    /// Same safety rules as the Apple account switch: refused while unsynced records exist; safety copy first, then only the ART play records are cleared.
    @MainActor
    public static func replace(_ o: inout SyncOwnership, store: FileDriveLocalStore) -> AccountSwitch.Outcome {
        guard !o.hasUnsynced(localDigest: store.digest()) else { return .refusedUnsynced }
        guard store.backupRecords(), store.resetRecords() else { return .backupFailed }
        o.adopt()
        return .ok
    }
}
