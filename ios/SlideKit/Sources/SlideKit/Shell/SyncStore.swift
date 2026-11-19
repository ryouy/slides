import Foundation
import UIKit
import Observation
import SlideCore

/// Observes `SlideRecordsReloaded` for a game store and removes itself when the store goes away.
final class RecordsReloadObserver {
    private var token: NSObjectProtocol?
    init(_ handler: @escaping @MainActor () -> Void) {
        token = NotificationCenter.default.addObserver(forName: .slideRecordsReloaded, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { handler() }
        }
    }
    deinit { if let token { NotificationCenter.default.removeObserver(token) } }
}

/// HTTP implementation of `SyncTransport` (GET / PUT /api/apple/sync).
struct HTTPSyncTransport: SyncTransport {
    let api = APIClient()
    let token: String

    private struct GetReply: Decodable { let version: Int; let doc: String? }
    private struct PutBody: Encodable { let baseVersion: Int; let doc: String }
    private struct PutReply: Decodable { let version: Int }

    func fetch() async throws -> RemoteSync {
        let r = try await call("GET", nil)
        guard r.status == 200, let g = try? JSONDecoder().decode(GetReply.self, from: r.data) else { throw SyncError.unavailable }
        return RemoteSync(version: g.version, doc: g.doc)
    }

    func push(baseVersion: Int, doc: String) async throws -> PushResult {
        let body = try? JSONEncoder().encode(PutBody(baseVersion: baseVersion, doc: doc))
        let r = try await call("PUT", body)
        if r.status == 409, let g = try? JSONDecoder().decode(GetReply.self, from: r.data) { return .conflict(RemoteSync(version: g.version, doc: g.doc)) }
        guard r.status == 200, let p = try? JSONDecoder().decode(PutReply.self, from: r.data) else { throw SyncError.unavailable }
        return .ok(version: p.version)
    }

    private func call(_ method: String, _ body: Data?) async throws -> (status: Int, data: Data) {
        do {
            let r = try await api.send(method, "/api/apple/sync", token: token, body: body, timeout: 30)
            if r.status == 401 { throw SyncError.signinRequired }
            return r
        } catch let e as SyncError { throw e } catch { throw SyncError.unavailable }
    }
}

struct SyncSettings: Codable { var enabled = false; var ownership = SyncOwnership() }

/// Optional records sync. Off until the person turns it on; then: at launch, on returning to the foreground, when the network is back,
/// and about 5 seconds after a game saves records. Failures are silent ("try later") and never touch local records.
@MainActor @Observable
public final class SyncStore {
    public enum Failure: Equatable { case later, updateApp }
    public enum Status: Equatable { case idle, syncing, lastSynced(Date), failed(Failure) }

    public private(set) var status: Status = .idle
    public private(set) var syncEnabled: Bool
    private let account: AccountStore
    private let network: Reachability
    private let settings = JSONFileStore<SyncSettings>(name: "sync-settings")
    private let local: SyncLocalStore
    private let fileLocal: FileSyncLocalStore
    private var ownership: SyncOwnership
    private var running = false
    private var rerun = false
    private var debounce: Task<Void, Never>?
    private var lastDoc: SyncDocument?
    private var observers: [NSObjectProtocol] = []

    public init(account: AccountStore, network: Reachability) {
        self.account = account
        self.network = network
        let f = FileSyncLocalStore()
        self.local = f; self.fileLocal = f
        let saved = settings.load()
        syncEnabled = saved?.enabled ?? false
        ownership = saved?.ownership ?? SyncOwnership()
        account.onSessionEnded = { [weak self] n in self?.sessionEnded(n) }
        account.onSignedIn = { [weak self] id in self?.signedIn(accountId: id) }
    }

    public var isActive: Bool { syncEnabled && account.isSignedIn }

    /// Called once at launch.
    public func start() {
        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.trigger() }
        })
        observers.append(nc.addObserver(forName: .slideRecordsChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.recordsChanged() }
        })
        watchNetwork()
        trigger()
    }

    /// The explicit switch in Settings. Turning it on syncs at once.
    public func setEnabled(_ on: Bool) {
        guard on != syncEnabled else { return }
        syncEnabled = on
        persistSettings()
        if on { Task { await syncNow() } } else { debounce?.cancel(); status = .idle; lastDoc = nil }
    }

    private func persistSettings() { settings.save(SyncSettings(enabled: syncEnabled, ownership: ownership)) }

    /// Records that were synced with another account are cleared before this account's first sync: accounts never mix.
    private func signedIn(accountId: String) {
        if ownership.signedIn(accountId: accountId) { _ = fileLocal.resetRecords(); NotificationCenter.default.post(name: .slideRecordsReloaded, object: nil) }
        lastDoc = nil
        persistSettings()
    }

    private func sessionEnded(_ n: AccountStore.Notice) {
        debounce?.cancel()
        if n == .deleted || n == .deletedKeepApple { ownership.deleted() } else { ownership.signedOut() }
        syncEnabled = false
        persistSettings()
        status = .idle; lastDoc = nil
    }

    private func trigger() { if isActive { Task { await syncNow() } } }

    private func recordsChanged() {
        guard isActive else { return }
        debounce?.cancel()
        debounce = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled, let self else { return }
            // a game saved something that is not a record (a move in a running puzzle): nothing to send
            if let last = self.lastDoc, self.local.read() == last { return }
            await self.syncNow()
        }
    }

    private func watchNetwork() {
        withObservationTracking { _ = network.isOnline } onChange: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                if self.network.isOnline { self.trigger() }
                self.watchNetwork()
            }
        }
    }

    public func syncNow() async {
        guard isActive else { return }
        guard network.isOnline else { return } // offline: skip silently, retried when the network is back
        if running { rerun = true; return }
        running = true
        repeat {
            rerun = false
            guard isActive, let token = account.token else { break }
            await runOnce(token)
        } while rerun
        running = false
    }

    private func runOnce(_ token: String) async {
        status = .syncing
        do {
            let r = try await SyncEngine(transport: HTTPSyncTransport(token: token), local: local).run()
            lastDoc = r.document
            ownership.synced(); persistSettings()
            status = .lastSynced(Date())
            if r.changedLocal { NotificationCenter.default.post(name: .slideRecordsReloaded, object: nil) }
        } catch SyncError.signinRequired {
            account.sessionExpired()
        } catch SyncError.newerSchema {
            status = .failed(.updateApp)
        } catch {
            status = .failed(.later)
        }
    }
}
