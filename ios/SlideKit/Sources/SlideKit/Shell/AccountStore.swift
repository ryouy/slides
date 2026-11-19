import Foundation
import SlideCore

/// Talks JSON to the Worker (`SlidesAPIBase` in Info.plist, like ImageStore). Bearer token, no cookies.
struct APIClient: Sendable {
    struct Failure: Error { var status: Int? } // nil = no answer (offline, timeout)

    var base: String {
        (Bundle.main.object(forInfoDictionaryKey: "SlidesAPIBase") as? String).flatMap { $0.hasPrefix("$(") || $0.isEmpty ? nil : $0 } ?? "https://slides.ryouy.workers.dev"
    }

    func send(_ method: String, _ path: String, token: String? = nil, body: Data? = nil, timeout: TimeInterval = 20) async throws -> (status: Int, data: Data) {
        guard let url = URL(string: base + path), url.scheme == "https" else { throw Failure(status: nil) }
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.httpMethod = method
        req.httpShouldHandleCookies = false
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body { req.httpBody = body; req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let cfg = URLSessionConfiguration.ephemeral
        cfg.httpCookieAcceptPolicy = .never
        do {
            let (d, r) = try await URLSession(configuration: cfg).data(for: req)
            guard let h = r as? HTTPURLResponse else { throw Failure(status: nil) }
            return (h.statusCode, d)
        } catch { throw Failure(status: nil) }
    }
}

/// The optional account (Sign in with Apple). Only the session token is kept, in the Keychain; signing in is never required.
@MainActor @Observable
public final class AccountStore {
    public enum State: Equatable { case signedOut, signedIn(accountId: String?) }
    public enum Notice: Equatable { case sessionExpired, signInFailed, signOutDone, deleteFailed, deleted, deletedKeepApple }

    public private(set) var state: State = .signedOut
    public private(set) var busy = false
    /// Server-confirmed access from a linked Stripe or Apple subscription.  It
    /// complements (never replaces) StoreKit's local entitlement.
    public private(set) var remotePremium = false
    public private(set) var signedInWithGoogle = false
    /// A short message for the UI (the sheet shows it and clears it with `clearNotice()`).
    public private(set) var notice: Notice?
    /// Called whenever the session ends (sign-out, deletion, 401) so sync can turn itself off.
    var onSessionEnded: ((Notice) -> Void)?
    var onSignedIn: ((String) -> Void)?
    /// Installed by `AppModel`. A StoreKit entitlement may have been acquired
    /// before this optional account was selected, so claim it immediately after
    /// a successful, explicit sign-in. The closure only observes StoreKit; it
    /// never starts a purchase or links identities.
    var claimCurrentEntitlement: (() async -> Void)?

    private let tokenKey = "session"
    private let api = APIClient()

    public init() {
        if Keychain.read(tokenKey) != nil { state = .signedIn(accountId: nil) }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-debugSignedIn") { state = .signedIn(accountId: "debug") } // screenshots only: no token, nothing is sent
        #endif
    }

    public var isSignedIn: Bool { if case .signedIn = state { return true }; return false }
    var token: String? { Keychain.read(tokenKey) }
    public func clearNotice() { notice = nil }

    /// `nonce` is the RAW random string (the Apple request carried its SHA-256 hex).
    public func signIn(identityToken: String, nonce: String, authorizationCode: Data? = nil) async {
        guard !busy else { return }
        busy = true; notice = nil
        defer { busy = false }
        do {
            guard let body = AccountWire.authBody(identityToken: identityToken, nonce: nonce, authorizationCode: authorizationCode) else { notice = .signInFailed; return }
            let (status, data) = try await api.send("POST", "/api/apple/auth", body: body)
            guard status == 200, let r = AccountWire.parseAuth(data), Keychain.write(tokenKey, r.token) else { notice = .signInFailed; return }
            state = .signedIn(accountId: r.accountId)
            signedInWithGoogle = false
            onSignedIn?(r.accountId)
            if let claimCurrentEntitlement { await claimCurrentEntitlement() }
            await refreshStatus()
        } catch { notice = .signInFailed }
    }

    /// Google sign-in establishes the same common account as the web.  It uses
    /// only the OpenID token; Drive access is requested elsewhere and only on
    /// demand.
    public func signInGoogle(idToken: String) async {
        guard !busy else { return }
        busy = true; notice = nil
        defer { busy = false }
        guard let body = try? JSONSerialization.data(withJSONObject: ["idToken": idToken]) else { notice = .signInFailed; return }
        do {
            let (status, data) = try await api.send("POST", "/api/apple/google/auth", body: body)
            guard status == 200, let r = AccountWire.parseAuth(data), Keychain.write(tokenKey, r.token) else { notice = .signInFailed; return }
            state = .signedIn(accountId: r.accountId)
            signedInWithGoogle = true
            onSignedIn?(r.accountId)
            if let claimCurrentEntitlement { await claimCurrentEntitlement() }
            await refreshStatus()
        } catch { notice = .signInFailed }
    }

    /// Explicitly joins a Google identity to the currently authenticated Apple
    /// account.  The Worker rejects replacement of either existing link.
    public func linkGoogle(idToken: String) async {
        guard let t = token, !busy, let body = try? JSONSerialization.data(withJSONObject: ["idToken": idToken]) else { return }
        busy = true; defer { busy = false }
        guard let r = try? await api.send("POST", "/api/apple/link/google", token: t, body: body), r.status == 200,
              let s = AccountWire.parseStatus(r.data) else { notice = .signInFailed; return }
        remotePremium = s.premium
    }

    /// Best-effort server call; the local session is always cleared.
    public func signOut() async {
        busy = true
        if let t = token { _ = try? await api.send("POST", "/api/apple/signout", token: t, timeout: 8) }
        busy = false
        endSession(.signOutDone)
    }

    /// The server must confirm before anything is cleared; on failure the person stays signed in. Records on this device are never touched.
    public func deleteAccount() async {
        guard !busy, let t = token else { return }
        busy = true; notice = nil
        defer { busy = false }
        do {
            let (status, data) = try await api.send("POST", "/api/apple/account/delete", token: t)
            if status == 401 { endSession(.sessionExpired); return }
            if status == 200, let r = AccountWire.parseDelete(data) { endSession(r.revoked == .revoked ? .deleted : .deletedKeepApple) } else { notice = .deleteFailed }
        } catch { notice = .deleteFailed }
    }

    /// A call answered 401: the session is gone.
    func sessionExpired() { if isSignedIn { endSession(.sessionExpired) } }

    /// Claims a StoreKit-signed transaction only after the user chose to sign
    /// in.  The Worker verifies it and refuses a transaction owned elsewhere.
    public func claim(_ signedTransaction: String?) async {
        guard let t = token, let signedTransaction, !signedTransaction.isEmpty else { return }
        let body = try? JSONSerialization.data(withJSONObject: ["signedTransaction": signedTransaction])
        guard let body, let r = try? await api.send("POST", "/api/apple/entitlement", token: t, body: body), r.status == 200,
              let s = AccountWire.parseStatus(r.data) else { return }
        remotePremium = s.premium
    }

    public func refreshStatus() async {
        guard let t = token, let r = try? await api.send("GET", "/api/apple/status", token: t) else { return }
        if r.status == 401 { sessionExpired(); return }
        guard r.status == 200, let s = AccountWire.parseStatus(r.data) else { return }
        remotePremium = s.premium
    }

    private func endSession(_ n: Notice) {
        Keychain.delete(tokenKey)
        state = .signedOut
        signedInWithGoogle = false
        remotePremium = false
        notice = n
        onSessionEnded?(n)
    }
}
