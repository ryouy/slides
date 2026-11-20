import SwiftUI
import AuthenticationServices
import SlideCore

public struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.colorScheme) private var colorScheme
    @State private var showPremium = false
    @State private var web: WebPage?
    @State private var bulk: (Int, Int)?
    @State private var downloadNotice: String?
    @State private var nonce = ""
    @State private var confirmDelete = false
    @Environment(\.colorScheme) private var scheme
    private let site = "https://slides.ryouy.workers.dev"

    public init() {}

    public var body: some View {
        @Bindable var app = app
        NavigationStack {
            Form {
                accountSection
                Section(app.t("ios.section.plan")) {
                    Button { showPremium = true } label: {
                        HStack {
                            Label(app.isPremium ? app.t("ios.premium.active") : "Premium", systemImage: app.isPremium ? "checkmark.seal.fill" : "sparkles")
                            Spacer()
                            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                        }.contentShape(Rectangle())
                    }
                }
                Section(app.t("ios.section.display")) {
                    Picker(app.t("settings.language"), selection: $app.lang) { ForEach(Lang.allCases) { Text($0.label).tag($0) } }
                    Picker(app.t("settings.theme"), selection: $app.theme) {
                        Text(app.t("settings.system")).tag(ThemePref.system)
                        Text(app.t("settings.light")).tag(ThemePref.light)
                        Text(app.t("settings.dark")).tag(ThemePref.dark)
                    }
                    Toggle(app.t("settings.colorblind"), isOn: $app.colorblind)
                }
                // Downloaded Premium paintings: only matters to Premium users, so nobody else sees it
                if app.isPremium {
                    Section(app.t("ios.dl.title")) {
                        // the section header already says "Downloaded paintings": the row holds only the count, on one line
                        Text(app.images.downloaded.isEmpty ? app.t("ios.dl.none") : app.t("ios.dl.count", ["n": app.images.downloaded.count, "mb": String(format: "%.1f", Double(app.images.totalBytes) / 1_048_576)]))
                            .lineLimit(1).minimumScaleFactor(0.8).foregroundStyle(.secondary)
                        Button(bulk.map { app.t("ios.dl.busy", ["a": $0.0, "b": $0.1]) } ?? app.t("ios.dl.all")) { Task { await downloadAll() } }.disabled(bulk != nil)
                        if let downloadNotice { Text(downloadNotice).font(.footnote).foregroundStyle(.secondary) }
                        if !app.images.downloaded.isEmpty {
                            Button(app.t("ios.dl.deleteAll"), role: .destructive) { Task { await app.images.deleteAll() } }
                        }
                    }
                }
                Section(app.t("ios.section.about")) {
                    if app.ads.privacyOptionsRequired { Button(app.t("ios.ads.privacy")) { Task { await app.ads.showPrivacyOptions() } } }
                    webRow(app.t("common.about"), "about")
                    webRow(app.t("ios.terms"), "terms")
                    webRow(app.t("ios.privacy"), "privacy")
                    webRow(app.t("common.contact"), "contact")
                    LabeledContent(app.t("ios.version"), value: Self.version)
                }
            }
            .navigationTitle(app.t("home.settings"))
            .sheet(isPresented: $showPremium) { PremiumView() }
            .sheet(item: $web) { w in SafariView(url: w.url).ignoresSafeArea() }
            .confirmationDialog(app.t("ios.account.deleteTitle"), isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(app.t("ios.account.deleteConfirm"), role: .destructive) { Task { await app.account.deleteAccount() } }
                Button(app.t("ios.account.cancel"), role: .cancel) {}
            } message: { Text(app.t("ios.account.deleteMessage")) }
            .confirmationDialog(app.t("ios.account.switchTitle"), isPresented: Binding(
                get: { app.sync.switchPrompt != nil },
                set: { if !$0 { app.sync.cancelSwitch() } } // dismissing without a choice = cancel (choices clear the prompt first)
            ), titleVisibility: .visible) {
                Button(app.t("ios.account.switchBringIn")) { app.sync.chooseBringIn() }
                if app.sync.switchPrompt?.canReplace == true {
                    Button(app.t("ios.account.switchReplace")) { app.sync.chooseReplace() }
                }
                Button(app.t("ios.account.cancel"), role: .cancel) { app.sync.cancelSwitch() }
            } message: {
                Text(app.t("ios.account.switchMessage") + (app.sync.switchPrompt?.canReplace == false ? "\n\n" + app.t("ios.account.switchKept") : ""))
            }
            .confirmationDialog(app.t("ios.drive.switchTitle"), isPresented: Binding(
                get: { app.drive.switchPrompt != nil },
                set: { if !$0 { app.drive.cancelSwitch() } }
            ), titleVisibility: .visible) {
                Button(app.t("ios.drive.switchBringIn")) { app.drive.chooseBringIn() }
                if app.drive.switchPrompt?.canReplace == true { Button(app.t("ios.drive.switchReplace")) { app.drive.chooseReplace() } }
                Button(app.t("ios.account.cancel"), role: .cancel) { app.drive.cancelSwitch() }
            } message: {
                Text(app.t("ios.drive.switchMessage") + (app.drive.switchPrompt?.canReplace == false ? "\n\n" + app.t("ios.account.switchKept") : ""))
            }
            .onDisappear { app.account.clearNotice(); app.googleAccount.clearNotice() }
        }
    }

    // MARK: account (optional): one compact section. Records sync goes to Google Drive when a Google account is signed in
    // (the same file as the web version), otherwise to our server for an Apple account; never both at once.

    private var anySignedIn: Bool { app.account.isSignedIn || app.googleAccount.isSignedIn }
    private var googleActive: Bool { app.googleAccount.isSignedIn }
    private var syncOn: Bool { app.drive.syncEnabled || app.sync.syncEnabled }

    private func setSync(_ on: Bool) {
        Task {
            if on {
                if googleActive { app.sync.setEnabled(false); await app.drive.setEnabled(true) }   // never both: records would be counted twice
                else { await app.drive.setEnabled(false); app.sync.setEnabled(true) }
            } else { app.sync.setEnabled(false); await app.drive.setEnabled(false) }
        }
    }

    private var appleIn: Bool { app.account.isSignedIn && !app.account.signedInWithGoogle }
    private var googleIn: Bool { app.account.signedInWithGoogle || app.googleAccount.isSignedIn }
    @State private var tab: Int? = nil   // 0 = Apple, 1 = Google
    private var shownTab: Int { tab ?? (debugGoogleTab || (googleIn && !appleIn) ? 1 : 0) }
    private var debugGoogleTab: Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("-settingsGoogle")
        #else
        return false
        #endif
    }

    /// One compact section: Apple | Google tabs, the sign-in button or the signed-in row, one sync switch, a link to the web version.
    @ViewBuilder private var accountSection: some View {
        Section(app.t("ios.account.title")) {
            HStack(spacing: 10) {
                providerTab(0, "Apple") { Image(systemName: "applelogo").font(.system(size: 16, weight: .medium)) }
                providerTab(1, "Google") { GoogleGMark().frame(width: 16, height: 16) }
            }
            .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            if shownTab == 0 { appleTab } else { googleTab }
            if anySignedIn {
                Toggle(isOn: Binding(get: { syncOn }, set: { setSync($0) })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(app.t("ios.account.sync"))
                        if syncOn { Text(activeSyncStatusText).font(.caption).foregroundStyle(activeSyncFailed ? Color.red : Color.secondary) }
                    }
                }
            }
            webRow(app.t("ios.account.webApp"), "")
            if let n = noticeText ?? driveNoticeText { Text(n).font(.footnote).foregroundStyle(.secondary) }
        }
    }

    /// A capsule tab with the provider's own mark: filled when selected, outlined otherwise.
    private func providerTab<Icon: View>(_ index: Int, _ name: String, @ViewBuilder icon: () -> Icon) -> some View {
        let on = shownTab == index
        return Button { withAnimation(.easeOut(duration: 0.16)) { tab = index } } label: {
            HStack(spacing: 7) { icon(); Text(name).font(.system(size: 15, weight: .semibold)) }
                .frame(maxWidth: .infinity, minHeight: 40)
                .foregroundStyle(on ? Web.bg : Web.fg)
                .background(on ? Web.fg : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? Color.clear : Web.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    @ViewBuilder private var appleTab: some View {
        if appleIn {
            signedInRow("Apple", google: false, canDelete: true) { await signOutApple() }
            if googleIn, let token = app.googleAccount.idToken {
                Button(app.t("ios.account.linkGoogle")) { Task { await app.account.linkGoogle(idToken: token) } }.disabled(app.account.busy)
            }
        } else {
            SignInWithAppleButton(.continue) { request in
                nonce = AppleNonce.random()
                request.requestedScopes = []
                request.nonce = AppleNonce.sha256Hex(nonce)
            } onCompletion: { result in
                guard case .success(let auth) = result, let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                      let tokenData = cred.identityToken, let token = String(data: tokenData, encoding: .utf8) else { return }
                let raw = nonce
                let code = cred.authorizationCode
                Task { await app.account.signIn(identityToken: token, nonce: raw, authorizationCode: code) }
            }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(height: 46)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .disabled(app.account.busy)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
    }

    @ViewBuilder private var googleTab: some View {
        if googleIn {
            signedInRow("Google", google: true, canDelete: false) { await signOutGoogle() }
        } else if app.googleAccount.isConfigured {
            Button { Task { await app.googleAccount.signIn() } } label: {
                HStack(spacing: 10) {
                    GoogleGMark().frame(width: 18, height: 18)
                    Text(app.t("ios.account.continueGoogle")).font(.system(size: 17, weight: .medium))
                }
                .foregroundStyle(Color(red: 0.12, green: 0.12, blue: 0.13))
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.gray.opacity(0.45), lineWidth: 1))
            }
            .buttonStyle(.plain).disabled(app.googleAccount.busy)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
    }

    /// "Signed in" on the left; sign out on the right; delete (Apple account) in a small menu.
    private func signedInRow(_ name: String, google: Bool, canDelete: Bool, signOut: @escaping () async -> Void) -> some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                if google { GoogleGMark().frame(width: 18, height: 18) } else { Image(systemName: "applelogo").font(.system(size: 17, weight: .medium)) }
                Text(name).fontWeight(.medium)
            }.lineLimit(1).fixedSize()
            Spacer(minLength: 8)
            Button(app.t("ios.account.signOut")) { Task { await signOut() } }
                .buttonStyle(.borderless).lineLimit(1).fixedSize().disabled(app.account.busy)
            if canDelete {
                Menu {
                    Button(app.t("ios.account.delete"), role: .destructive) { confirmDelete = true }
                } label: { Image(systemName: "ellipsis.circle").font(.title3) }
                .buttonStyle(.borderless).disabled(app.account.busy)
            }
        }
    }

    /// Signing out of Apple leaves Google signed in (and the other way round). The server session is shared, so when the other
    /// account is still signed in on the device it takes over the session.
    private func signOutApple() async {
        let google = app.googleAccount.isSignedIn ? app.googleAccount.idToken : nil
        await app.account.signOut()
        if let google { await app.account.signInGoogle(idToken: google) }
    }

    private func signOutGoogle() async {
        await app.drive.setEnabled(false)               // Drive sync needs the Google account
        app.googleAccount.signOut()
        if app.account.signedInWithGoogle { await app.account.signOut() }   // the session was made from Google; an Apple session stays
    }

    private var activeSyncFailed: Bool { app.drive.syncEnabled ? driveFailed : syncFailed }
    private var activeSyncStatusText: String { app.drive.syncEnabled ? driveStatusText : syncStatusText }

    private var driveFailed: Bool { if case .failed = app.drive.status { return true }; return false }

    private var driveStatusText: String {
        switch app.drive.status {
        case .idle: return app.t("ios.account.notSynced")
        case .syncing: return app.t("ios.account.syncing")
        case .lastSynced(let d): return app.t("ios.account.lastSynced", ["time": d.formatted(date: .abbreviated, time: .shortened)])
        case .failed(.later): return app.t("ios.account.failedLater")
        case .failed(.updateApp): return app.t("ios.account.failedUpdate")
        }
    }

    private var driveNoticeText: String? {
        switch app.googleAccount.notice {
        case .sessionExpired: return app.t("ios.drive.noticeExpired")
        case .signInFailed: return app.t("ios.drive.noticeSignInFailed")
        case .driveDenied: return app.t("ios.drive.noticeDenied")
        case nil: return nil
        }
    }

    private var syncFailed: Bool { if case .failed = app.sync.status { return true }; return false }

    private var syncStatusText: String {
        switch app.sync.status {
        case .idle: return app.t("ios.account.notSynced")
        case .syncing: return app.t("ios.account.syncing")
        case .lastSynced(let d): return app.t("ios.account.lastSynced", ["time": d.formatted(date: .abbreviated, time: .shortened)])
        case .failed(.later): return app.t("ios.account.failedLater")
        case .failed(.updateApp): return app.t("ios.account.failedUpdate")
        }
    }

    private var noticeText: String? {
        switch app.account.notice {
        case .sessionExpired: return app.t("ios.account.noticeExpired")
        case .signInFailed: return app.t("ios.account.noticeSignInFailed")
        case .deleteFailed: return app.t("ios.account.noticeDeleteFailed")
        case .deleted: return app.t("ios.account.noticeDeleted")
        case .deletedKeepApple: return app.t("ios.account.noticeDeletedApple")
        case .signOutDone, nil: return nil
        }
    }

    struct WebPage: Identifiable { let id = UUID(); let url: URL }
    /// A legal / info page of the website, shown in an in-app Safari sheet.
    private func webRow(_ title: String, _ page: String) -> some View {
        Button { if let u = URL(string: "\(site)/\(page)") { web = WebPage(url: u) } } label: {
            HStack { Text(title).foregroundStyle(.primary); Spacer(); Image(systemName: "arrow.up.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary) }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func downloadAll() async {
        downloadNotice = nil
        let todo = app.catalog.artworks.filter { !app.catalog.isFree($0.id) && !app.images.downloaded.contains($0.id) }
        for (i, a) in todo.enumerated() {
            bulk = (i + 1, todo.count)
            do { try await app.images.download(a.id, premium: app.premium, account: app.account) { _ in }
            } catch let e as ImageStore.DownloadError {
                switch e {
                case .notPremium: downloadNotice = app.t("ios.dl.premiumOnly")
                case .offline: downloadNotice = app.t("ios.dl.offline")
                default: downloadNotice = app.t("ios.dl.failed")
                }
                break // stop at the first failure; finished ones are kept and the reason is shown
            } catch {
                downloadNotice = app.t("ios.dl.failed")
                break
            }
        }
        bulk = nil
    }

    static var version: String {
        let b = Bundle.main
        return "\(b.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(b.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))"
    }
}
