import Foundation
import CryptoKit

/// Which account the records on this device have been synced with. Prevents two accounts from ever mixing records:
/// if account A synced from this device and account B signs in later, the local records (which hold A's data) are cleared before B's first sync.
/// Only a SHA-256 of the account id is kept. Records never synced to any account (`owner == nil`) belong to the device and are adopted by whoever syncs first.
public struct SyncOwnership: Codable, Equatable, Sendable {
    public var owner: String?
    public var current: String?
    public init(owner: String? = nil, current: String? = nil) { self.owner = owner; self.current = current }

    public static func hash(_ accountId: String) -> String {
        SHA256.hash(data: Data(accountId.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// A sign-in happened. Returns true if the local records belong to another account and must be cleared first.
    public mutating func signedIn(accountId: String) -> Bool {
        let h = Self.hash(accountId)
        current = h
        if let o = owner, o != h { owner = nil; return true }
        return false
    }
    /// A sync finished: the local records are now in step with the signed-in account.
    public mutating func synced() { if let c = current { owner = c } }
    public mutating func signedOut() { current = nil }
    /// The account (and its synced copy) is gone: local records are the device's own again.
    public mutating func deleted() { owner = nil; current = nil }
}

public extension FileSyncLocalStore {
    /// Replaces the records of all games with empty ones (unfinished puzzles and preferences stay).
    func resetRecords() -> Bool { write(SyncDocument(), force: true) }
}
