import Foundation
import UIKit
import GoogleSignIn
import SlideCore

/// Optional Google sign-in, used only to reach the person's own Drive appDataFolder (never required, never part of Premium).
/// Sign-in asks for the basic profile scope only; the Drive scope is requested separately when the person turns Drive sync on.
/// The person's name and e-mail are never read, stored or sent: the user object is used for "signed in or not" and for tokens.
@MainActor @Observable
public final class GoogleAccountStore {
    public enum Notice: Equatable { case sessionExpired, signInFailed, driveDenied }
    public static let driveScope = "https://www.googleapis.com/auth/drive.appdata"

    public private(set) var isSignedIn = false
    public private(set) var busy = false
    public private(set) var notice: Notice?
    /// Kept only in memory for an explicit common-account link.
    public private(set) var idToken: String?
    /// DEBUG screenshots only: pretend to be configured / signed in; nothing touches the network.
    private(set) var isFake = false

    /// Called with a SHA-256 of Google's opaque account id after a sign-in (the id itself is never stored).
    var onSignedIn: ((String) -> Void)?
    /// Short-lived OpenID token for the common-account service; never persisted.
    var onIdentityToken: ((String) -> Void)?
    var onSessionEnded: (() -> Void)?

    public var isConfigured: Bool {
        if isFake { return true }
        guard let id = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String else { return false }
        return !id.isEmpty && !id.hasPrefix("$(") && id != "invalid.apps.googleusercontent.com" && id.hasSuffix(".apps.googleusercontent.com")
    }

    public init() {
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments
        if a.contains("-debugGoogle") || a.contains("-debugGoogleOn") { isFake = true; isSignedIn = true }
        if a.contains("-debugGoogleOut") { isFake = true }
        #endif
    }

    /// Called once at launch: picks up a previous sign-in silently.
    public func start() async {
        guard isConfigured, !isFake, GIDSignIn.sharedInstance.hasPreviousSignIn() else { return }
        do {
            let user = try await GIDSignIn.sharedInstance.restorePreviousSignIn()
            isSignedIn = true
            if let id = user.userID { onSignedIn?(SyncOwnership.hash(id)) }
            idToken = user.idToken?.tokenString
            if let token = idToken { onIdentityToken?(token) }
        } catch { isSignedIn = false }
    }

    public func clearNotice() { notice = nil }

    public func signIn() async {
        guard isConfigured, !isFake, !busy, let vc = Self.presenter() else { return }
        busy = true; notice = nil
        defer { busy = false }
        do {
            let r = try await GIDSignIn.sharedInstance.signIn(withPresenting: vc) // basic sign-in only: no Drive scope here
            guard let id = r.user.userID else { GIDSignIn.sharedInstance.signOut(); notice = .signInFailed; return }
            isSignedIn = true
            onSignedIn?(SyncOwnership.hash(id))
            idToken = r.user.idToken?.tokenString
            if let token = idToken { onIdentityToken?(token) }
        } catch let e as GIDSignInError where e.code == .canceled {
            // the person closed the sheet: nothing to say
        } catch { notice = .signInFailed }
    }

    /// Ends the session on this device. Records are never touched.
    public func signOut() {
        if !isFake { GIDSignIn.sharedInstance.signOut() }
        endSession(nil)
    }

    var hasDriveScope: Bool {
        isFake || (GIDSignIn.sharedInstance.currentUser?.grantedScopes ?? []).contains(Self.driveScope)
    }

    /// Asks Google for the Drive appDataFolder permission (a separate, explicit step). Returns whether it was granted.
    func requestDriveScope() async -> Bool {
        if isFake { return true }
        guard let user = GIDSignIn.sharedInstance.currentUser, let vc = Self.presenter() else { return false }
        if hasDriveScope { return true }
        do { _ = try await user.addScopes([Self.driveScope], presenting: vc); return hasDriveScope }
        catch let e as GIDSignInError where e.code == .canceled { return false }
        catch { notice = .driveDenied; return false }
    }

    /// Withdraws Drive access at Google (like the web's switch-off). This also ends the Google session on this device.
    func revokeAccess() async {
        if !isFake { try? await GIDSignIn.sharedInstance.disconnect() }
        endSession(nil)
    }

    enum TokenError: Error { case signedOut, offline, expired }

    /// A fresh access token (refreshed when needed). Never logged or stored by the app.
    func accessToken() async throws -> String {
        guard let user = GIDSignIn.sharedInstance.currentUser else { throw TokenError.signedOut }
        do { return try await user.refreshTokensIfNeeded().accessToken.tokenString }
        catch let e as NSError where e.domain == NSURLErrorDomain { throw TokenError.offline }
        catch { throw TokenError.expired }
    }

    /// The token was refused or revoked: back to signed out with a short notice.
    func sessionExpired() {
        guard isSignedIn else { return }
        if !isFake { GIDSignIn.sharedInstance.signOut() }
        endSession(.sessionExpired)
    }

    private func endSession(_ n: Notice?) {
        isSignedIn = false
        idToken = nil
        notice = n
        onSessionEnded?()
    }

    private static func presenter() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive } ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var vc = scene?.windows.first { $0.isKeyWindow }?.rootViewController
        while let next = vc?.presentedViewController { vc = next }
        return vc
    }
}
