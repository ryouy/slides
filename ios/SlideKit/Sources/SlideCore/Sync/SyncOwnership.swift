import Foundation
import CryptoKit

/// What to do when an account signs in on a device whose records were synced with another account.
public enum AccountSwitchPolicy {
    public enum Decision: Equatable, Sendable { case proceed, ask(canReplace: Bool) }
    /// `owner` and `newAccount` are account hashes (`SyncOwnership.hash`). No owner or the same owner: sync normally.
    /// A different owner: ask the person. Replacing the device's records is only offered when none are unsynced.
    public static func decide(owner: String?, newAccount: String, hasUnsynced: Bool) -> Decision {
        guard let owner, owner != newAccount else { return .proceed }
        return .ask(canReplace: !hasUnsynced)
    }
}

/// Which account the records on this device were last synced with, and what they looked like right after (`syncedDigest`).
/// Only a SHA-256 of the account id is kept. Records never synced to any account (`owner == nil`) are adopted by the first account that syncs.
/// Nothing here ever clears records by itself.
public struct SyncOwnership: Codable, Equatable, Sendable {
    public var owner: String?
    public var current: String?
    public var syncedDigest: String?
    public init(owner: String? = nil, current: String? = nil, syncedDigest: String? = nil) { self.owner = owner; self.current = current; self.syncedDigest = syncedDigest }

    public static func hash(_ accountId: String) -> String {
        SHA256.hash(data: Data(accountId.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    /// SHA-256 of the records as encoded for sync (normalized, sorted keys, history in canonical order): stable across orderings.
    public static func digest(_ doc: SyncDocument) -> String {
        SHA256.hash(data: Data(doc.normalized().encode().utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Records changed since the owner's last successful sync (or were never confirmed synced).
    public func hasUnsynced(localDigest: String) -> Bool { owner != nil && syncedDigest != localDigest }

    public mutating func signedIn(accountId: String) { current = Self.hash(accountId) }

    /// The decision for the currently signed-in account (`.proceed` when nobody is signed in).
    public func decision(localDigest: String) -> AccountSwitchPolicy.Decision {
        guard let c = current else { return .proceed }
        return AccountSwitchPolicy.decide(owner: owner, newAccount: c, hasUnsynced: hasUnsynced(localDigest: localDigest))
    }

    /// A sync finished: the local records are in step with the signed-in account.
    public mutating func synced(digest: String) { if let c = current { owner = c; syncedDigest = digest } }
    /// Choice "bring this device's records into the new account": the new account becomes the owner and the normal merge sync adds them.
    public mutating func adopt() { owner = current; syncedDigest = nil }
    public mutating func signedOut() { current = nil }
    /// The account (and its synced copy) is gone: the device's records are the device's own again.
    public mutating func deleted() { owner = nil; current = nil; syncedDigest = nil }
}

public enum AccountSwitch {
    public enum Outcome: Equatable, Sendable { case ok, refusedUnsynced, backupFailed }

    @MainActor
    public static func bringIn(_ o: inout SyncOwnership) { o.adopt() }

    /// "Use only the new account's records": refused while unsynced records exist; otherwise the safety copy is written first and only then
    /// the records (never puzzles in progress, preferences or own photos) are cleared.
    @MainActor
    public static func replace(_ o: inout SyncOwnership, store: FileSyncLocalStore) -> Outcome {
        let local = SyncOwnership.digest(store.read())
        guard !o.hasUnsynced(localDigest: local) else { return .refusedUnsynced }
        guard store.backupRecords(), store.resetRecords() else { return .backupFailed }
        o.adopt()
        return .ok
    }
}

public extension FileSyncLocalStore {
    /// Replaces the records of all games with empty ones (unfinished puzzles and preferences stay).
    func resetRecords() -> Bool { write(SyncDocument(), force: true) }
}
