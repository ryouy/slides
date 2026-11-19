import SwiftUI
import AuthenticationServices
import GoogleSignInSwift
import SlideCore

public struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.colorScheme) private var colorScheme
    @State private var showPremium = false
    @State private var web: WebPage?
    @State private var bulk: (Int, Int)?
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
                googleSection
                Section(app.t("ios.section.plan")) {
                    if app.isPremium {
                        Label(app.t("ios.premium.active"), systemImage: "checkmark.seal.fill").foregroundStyle(.tint)
                    }
                    Button { showPremium = true } label: {
                        Label("Premium", systemImage: "sparkles").frame(maxWidth: .infinity, alignment: .leading)
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
                        LabeledContent(app.t("ios.dl.title"), value: app.images.downloaded.isEmpty ? app.t("ios.dl.none") : app.t("ios.dl.count", ["n": app.images.downloaded.count, "mb": String(format: "%.1f", Double(app.images.totalBytes) / 1_048_576)]))
                        Button(bulk.map { app.t("ios.dl.busy", ["a": $0.0, "b": $0.1]) } ?? app.t("ios.dl.all")) { Task { await downloadAll() } }.disabled(bulk != nil)
                        Text(app.t("ios.dl.wifi")).font(.footnote).foregroundStyle(.secondary)
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
            .onDisappear { app.account.clearNotice(); app.googleAccount.clearNotice() }
        }
    }

    // MARK: account (optional; syncs game records only)

    @ViewBuilder private var accountSection: some View {
        Section {
            if app.account.isSignedIn {
                Label(app.t("ios.account.signedIn"), systemImage: "applelogo")
                Toggle(app.t("ios.account.sync"), isOn: Binding(get: { app.sync.syncEnabled }, set: { app.sync.setEnabled($0) }))
                if app.sync.syncEnabled {
                    Button { Task { await app.sync.syncNow() } } label: {
                        HStack {
                            Text(app.t("ios.account.syncNow"))
                            Spacer()
                            if app.sync.status == .syncing { ProgressView() }
                            else { Text(syncStatusText).font(.footnote).foregroundStyle(syncFailed ? Color.red : Color.secondary).multilineTextAlignment(.trailing) }
                        }
                    }
                    .disabled(app.sync.status == .syncing)
                } else {
                    Text(app.t("ios.account.syncOff")).font(.footnote).foregroundStyle(.secondary)
                }
                Button(app.t("ios.account.signOut")) { Task { await app.account.signOut() } }.disabled(app.account.busy)
                Button(app.t("ios.account.delete"), role: .destructive) { confirmDelete = true }.disabled(app.account.busy)
            } else {
                SignInWithAppleButton(.signIn) { request in
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
                // a stand-alone button (no card around it): black on light, white on dark, as Apple recommends for the two backgrounds
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .disabled(app.account.busy)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if let n = noticeText { Text(n).font(.footnote).foregroundStyle(.secondary) }
        } header: {
            Text(app.t("ios.account.title"))
        }
    }

    // MARK: Google Drive (optional; ART SLIDE records only, same file as the web version). Hidden until the owner configures a client id.

    @ViewBuilder private var googleSection: some View {
        if app.googleAccount.isConfigured {
            Section {
                if app.googleAccount.isSignedIn {
                    Label(app.t("ios.drive.signedIn"), systemImage: "externaldrive.badge.icloud")
                    Toggle(app.t("ios.drive.sync"), isOn: Binding(get: { app.drive.syncEnabled }, set: { on in Task { await app.drive.setEnabled(on) } }))
                    if app.drive.syncEnabled {
                        Button { Task { await app.drive.syncNow() } } label: {
                            HStack {
                                Text(app.t("ios.account.syncNow"))
                                Spacer()
                                if app.drive.status == .syncing { ProgressView() }
                                else { Text(driveStatusText).font(.footnote).foregroundStyle(driveFailed ? Color.red : Color.secondary).multilineTextAlignment(.trailing) }
                            }
                        }
                        .disabled(app.drive.status == .syncing)
                    } else {
                        Text(app.t("ios.drive.off")).font(.footnote).foregroundStyle(.secondary)
                    }
                    Button(app.t("ios.account.signOut")) { app.googleAccount.signOut() }.disabled(app.googleAccount.busy)
                } else {
                    GoogleSignInButton(scheme: scheme == .dark ? .dark : .light, style: .wide, state: app.googleAccount.busy ? .disabled : .normal) { Task { await app.googleAccount.signIn() } }
                        .frame(maxWidth: .infinity)
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .listRowBackground(Color.clear)
                }
                if let n = driveNoticeText { Text(n).font(.footnote).foregroundStyle(.secondary) }
            } header: {
                Text(app.t("ios.drive.title"))
            } footer: {
                if !app.googleAccount.isSignedIn { Text(app.t("ios.drive.footer")) }
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
        }
    }

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
        let todo = app.catalog.artworks.filter { !app.catalog.isFree($0.id) && !app.images.downloaded.contains($0.id) }
        for (i, a) in todo.enumerated() {
            bulk = (i + 1, todo.count)
            do { try await app.images.download(a.id, premium: app.premium) { _ in } } catch { break } // stop at the first failure; finished ones are kept
        }
        bulk = nil
    }

    static var version: String {
        let b = Bundle.main
        return "\(b.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(b.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))"
    }
}
