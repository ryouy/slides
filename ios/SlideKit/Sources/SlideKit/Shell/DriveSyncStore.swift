import Foundation
import UIKit
import Observation
import SlideCore

struct DriveSettings: Codable { var enabled = false; var ownership = SyncOwnership() }

/// Optional ART SLIDE records sync through the person's own Google Drive (hidden appDataFolder), the same file as the web version.
/// Off until the person turns it on (that is when Google is asked for the Drive permission). Turning it off withdraws the access.
/// Syncs at launch, on foreground, when the network is back and ~5 s after records change. Failures keep local records untouched.
@MainActor @Observable
public final class DriveSyncStore {
    public enum Status: Equatable { case idle, syncing, lastSynced(Date), failed(SyncStore.Failure) }

    public private(set) var status: Status = .idle
    public private(set) var syncEnabled: Bool
    public private(set) var switchPrompt: SyncStore.SwitchPrompt?
    private let account: GoogleAccountStore
    private let network: Reachability
    private let settings = JSONFileStore<DriveSettings>(name: "drive-settings")
    private let local = FileDriveLocalStore()
    private var ownership: SyncOwnership
    private var running = false
    private var rerun = false
    private var debounce: Task<Void, Never>?
    private var lastDigest: String?
    private var observers: [NSObjectProtocol] = []
    private var debugKeepPrompt = false

    public init(account: GoogleAccountStore, network: Reachability) {
        self.account = account
        self.network = network
        let saved = settings.load()
        syncEnabled = saved?.enabled ?? false
        ownership = saved?.ownership ?? SyncOwnership()
        account.onSignedIn = { [weak self] hash in self?.signedIn(hash) }
        account.onSessionEnded = { [weak self] in self?.sessionEnded() }
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments
        if a.contains("-debugGoogleOn") { syncEnabled = true; status = .lastSynced(Date()) }
        if a.contains("-debugGoogleSwitch") { switchPrompt = .init(canReplace: true); debugKeepPrompt = true }
        #endif
    }

    public var isActive: Bool { syncEnabled && account.isSignedIn && !account.isFake && account.hasDriveScope }

    public func start() {
        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.trigger() }
        })
        observers.append(nc.addObserver(forName: .slideRecordsChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.recordsChanged() }
        })
        watchNetwork()
        Task { await account.start(); trigger() }
    }

    /// The explicit switch. On: ask Google for the Drive permission, then sync at once. Off: withdraw the access; local records stay.
    public func setEnabled(_ on: Bool) async {
        guard on != syncEnabled else { return }
        if on {
            guard await account.requestDriveScope() else { return }
            syncEnabled = true
            persistSettings()
            if evaluateSwitch() { return }
            await syncNow()
        } else {
            debounce?.cancel()
            syncEnabled = false
            ownership.signedOut(); persistSettings()
            status = .idle; lastDigest = nil; switchPrompt = nil
            await account.revokeAccess()
        }
    }

    private func persistSettings() { settings.save(DriveSettings(enabled: syncEnabled, ownership: ownership)) }

    private func signedIn(_ hash: String) {
        ownership.current = hash
        persistSettings()
        if syncEnabled { evaluateSwitch() }
    }

    private func sessionEnded() {
        debounce?.cancel()
        syncEnabled = false
        ownership.signedOut(); persistSettings()
        status = .idle; lastDigest = nil; switchPrompt = nil
    }

    @discardableResult
    private func evaluateSwitch() -> Bool {
        if debugKeepPrompt, switchPrompt != nil { return true }
        guard account.isSignedIn, ownership.current != nil else { switchPrompt = nil; return false }
        if case .ask(let canReplace) = ownership.decision(localDigest: local.digest()) { switchPrompt = .init(canReplace: canReplace); return true }
        switchPrompt = nil
        return false
    }

    public func chooseBringIn() {
        debugKeepPrompt = false
        ownership.adopt(); persistSettings(); switchPrompt = nil
        trigger()
    }

    public func chooseReplace() {
        debugKeepPrompt = false
        let r = DriveAccountSwitch.replace(&ownership, store: local)
        persistSettings()
        if r == .ok { switchPrompt = nil; NotificationCenter.default.post(name: .slideRecordsReloaded, object: nil); trigger() } else { evaluateSwitch() }
    }

    /// Cancel / dismiss: the Google session is ended again; nothing local changes.
    public func cancelSwitch() {
        guard switchPrompt != nil else { return }
        debugKeepPrompt = false
        switchPrompt = nil
        account.signOut()
    }

    private func trigger() { if isActive { Task { await syncNow() } } }

    private func recordsChanged() {
        guard isActive else { return }
        debounce?.cancel()
        debounce = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled, let self else { return }
            if let last = self.lastDigest, self.local.digest() == last { return } // only a move in a running puzzle changed
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
        if evaluateSwitch() { return }
        guard network.isOnline else { return }
        if running { rerun = true; return }
        running = true
        repeat { rerun = false; guard isActive else { break }; await runOnce() } while rerun
        running = false
    }

    private func runOnce() async {
        status = .syncing
        let before = local.digest()
        let acct = account
        let client = GoogleDriveClient(token: { try await acct.accessToken() })
        let outcome = await DriveSyncRunner(transport: client, local: local).run()
        switch outcome {
        case .ok:
            let after = local.digest()
            lastDigest = after
            ownership.synced(digest: after); persistSettings()
            status = .lastSynced(Date())
            if after != before { NotificationCenter.default.post(name: .slideRecordsReloaded, object: nil) }
        case .needsConsent: account.sessionExpired()
        case .newerVersion: status = .failed(.updateApp)
        case .unreadable, .error: status = .failed(.later)
        }
    }
}

