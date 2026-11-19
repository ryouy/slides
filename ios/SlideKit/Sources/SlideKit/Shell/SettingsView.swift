import SwiftUI
import SlideCore

public struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var showPremium = false
    @State private var bulk: (Int, Int)?
    private let site = "https://slides.ryouy.workers.dev"

    public init() {}

    public var body: some View {
        @Bindable var app = app
        NavigationStack {
            Form {
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
                Section(app.t("ios.section.offline")) {
                    Text(app.t("ios.offline.note")).font(.footnote).foregroundStyle(.secondary)
                    LabeledContent(app.t("ios.dl.title"), value: app.images.downloaded.isEmpty ? app.t("ios.dl.none") : app.t("ios.dl.count", ["n": app.images.downloaded.count, "mb": String(format: "%.1f", Double(app.images.totalBytes) / 1_048_576)]))
                    if app.isPremium {
                        Button(bulk.map { app.t("ios.dl.busy", ["a": $0.0, "b": $0.1]) } ?? app.t("ios.dl.all")) { Task { await downloadAll() } }.disabled(bulk != nil)
                        Text(app.t("ios.dl.wifi")).font(.footnote).foregroundStyle(.secondary)
                    }
                    if !app.images.downloaded.isEmpty {
                        Button(app.t("ios.dl.deleteAll"), role: .destructive) { Task { await app.images.deleteAll() } }
                    }
                }
                Section(app.t("ios.section.about")) {
                    if app.ads.privacyOptionsRequired { Button(app.t("ios.ads.privacy")) { Task { await app.ads.showPrivacyOptions() } } }
                    Link(app.t("ios.terms"), destination: URL(string: "\(site)/terms")!)
                    Link(app.t("ios.privacy"), destination: URL(string: "\(site)/privacy")!)
                    Link(app.t("common.contact"), destination: URL(string: "\(site)/contact")!)
                    LabeledContent(app.t("ios.version"), value: Self.version)
                }
            }
            .navigationTitle(app.t("home.settings"))
            .sheet(isPresented: $showPremium) { PremiumView() }
        }
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
