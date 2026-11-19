import SwiftUI
import PhotosUI
import SlideCore

private struct PageScaffold<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) {
            ArtTopBar(title)
            ScrollView { content.padding(.horizontal, 16).padding(.vertical, 18).frame(maxWidth: 560).frame(maxWidth: .infinity, alignment: .leading) }
        }
        .artScreen()
    }
}

struct ArtHowView: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        PageScaffold(title: app.t("how.title")) {
            VStack(alignment: .leading, spacing: 18) {
                ForEach(1...4, id: \.self) { i in
                    HStack(alignment: .firstTextBaseline, spacing: 14) {
                        Text("\(i)").font(Web.font(22, .light)).foregroundStyle(Web.muted).frame(width: 24)
                        Text(app.t("how.art\(i)")).font(Web.font(15)).lineSpacing(4).foregroundStyle(Web.fg)
                    }
                }
            }
        }
    }
}

struct ArtStatsView: View {
    @Environment(AppModel.self) private var app
    @Environment(ArtStore.self) private var store
    var body: some View {
        let s = store.save, today = DateKeys.jstDateKey()
        PageScaffold(title: app.t("stats.title")) {
            VStack(alignment: .leading, spacing: 20) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
                    big(s.completed, app.t("stats.completed")); big(ArtStats.currentDailyStreak(s.dailyHistory, today: today), app.t("stats.streak"))
                    big(ArtStats.maxDailyStreak(s.dailyHistory), app.t("stats.bestStreak")); big(s.dailyHistory.count, app.t("stats.dailies"))
                }
                heading(app.t("stats.bests"))
                VStack(spacing: 0) {
                    ForEach(artLevels, id: \.self) { l in
                        let b = s.bests[String(l)]
                        row(app.t("level.\(l)"), b?.timeMs.map { "\(ArtStats.formatTime($0)) · \(app.t("stats.moves", ["n": b?.moves ?? 0]))" } ?? app.t("stats.none"))
                    }
                }
                heading(app.t("stats.recent"))
                if s.history.isEmpty { Text(app.t("stats.noGames")).font(Web.font(14)).foregroundStyle(Web.muted) }
                else {
                    VStack(spacing: 0) {
                        ForEach(Array(s.history.suffix(8).reversed().enumerated()), id: \.offset) { _, h in
                            row(String(h.date.dropFirst(5)), "\(app.catalog.artwork(h.artworkId)?.title ?? h.artworkId) · \(ArtStats.formatTime(h.timeMs)) · \(app.t("stats.moves", ["n": h.moves]))")
                        }
                    }
                }
            }
        }
    }
    private func big(_ n: Int, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text("\(n)").font(Web.font(32, .light, relativeTo: .largeTitle)).monospacedDigit().foregroundStyle(Web.fg)
            Text(label).font(Web.font(10, .semibold, relativeTo: .caption2)).tracking(1.5).foregroundStyle(Web.muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14).overlay(Rectangle().stroke(Web.line, lineWidth: 1)).accessibilityElement(children: .combine)
    }
    private func heading(_ t: String) -> some View { Text(t).font(Web.font(12, .semibold, relativeTo: .caption)).tracking(2).foregroundStyle(Web.fg).textCase(.uppercase).accessibilityAddTraits(.isHeader) }
    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(k).font(Web.font(13, .semibold)).foregroundStyle(Web.fg).frame(minWidth: 56, alignment: .leading)
            Text(v).font(Web.font(13)).foregroundStyle(Web.muted).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10).overlay(alignment: .bottom) { Rectangle().fill(Web.line).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}

struct ArtCreditsView: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        VStack(spacing: 0) {
            ArtTopBar(app.t("credits.title"))
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    Text(app.t("credits.intro")).font(Web.font(14)).lineSpacing(3).foregroundStyle(Web.fg).padding(.vertical, 16)
                    ForEach(app.catalog.artworks) { a in
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(a.title), \(a.artist), \(a.year).").font(Web.font(13, .semibold)).foregroundStyle(Web.fg)
                            HStack(spacing: 4) {
                                Text(a.museum); Text("·")
                                if let u = URL(string: a.licenseUrl) { Link(a.license, destination: u) } else { Text(a.license) }; Text("·")
                                if let u = URL(string: a.sourceUrl) { Link(app.t("credits.source"), destination: u) }
                            }.font(Web.font(12)).foregroundStyle(Web.muted)
                            Text(app.t("credits.checked", ["date": a.verifiedAt])).font(Web.font(11)).foregroundStyle(Web.muted)
                            if a.descriptionLicenseUrl != nil {
                                HStack(spacing: 4) {
                                    Text("\(app.t("art.textSource")):")
                                    if let u = URL(string: a.descriptionSourceUrl ?? a.sourceUrl) { Link(a.descriptionAttribution ?? a.museum, destination: u) } else { Text(a.descriptionAttribution ?? a.museum) }
                                    Text("·")
                                    if let s = a.descriptionLicenseUrl, let u = URL(string: s) { Link(a.descriptionLicense ?? "CC BY 4.0", destination: u) }
                                }.font(Web.font(11)).foregroundStyle(Web.muted)
                                if let m = a.descriptionModifications { Text(m).font(Web.font(11)).foregroundStyle(Web.muted) }
                            }
                        }
                        .padding(.vertical, 10).frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .bottom) { Rectangle().fill(Web.line).frame(height: 1) }
                        .accessibilityElement(children: .contain)
                    }
                }
                .padding(.horizontal, 16).frame(maxWidth: 560).frame(maxWidth: .infinity)
            }
        }
        .artScreen()
    }
}

/// "My Photos" (Premium): pick pictures with the system photo picker (no photo-library permission needed). They stay on this device.
struct ArtPhotosView: View {
    @Environment(AppModel.self) private var app
    @Environment(ArtStore.self) private var store
    @Environment(CustomPhotoStore.self) private var photos
    @Binding var path: [ArtRoute]
    @State private var picks: [PhotosPickerItem] = []
    @State private var busy = false
    @State private var errors: [String] = []
    @State private var showPremium = false
    @State private var deleting: CustomPhoto?

    var body: some View {
        let locked = !app.isPremium
        VStack(spacing: 0) {
            ArtTopBar(app.t("photos.title"))
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if locked {
                        VStack(spacing: 12) {
                            Image(systemName: "lock.fill").font(.system(size: 28, weight: .light))
                            Text(app.t("premium.lockedPhotos")).font(Web.font(15)).multilineTextAlignment(.center)
                            Button(app.t("premium.subscribe")) { showPremium = true }.buttonStyle(WebButtonStyle(filled: true, minHeight: 50))
                        }.foregroundStyle(Web.fg).frame(maxWidth: .infinity).padding(.vertical, 12)
                    } else {
                        PhotosPicker(selection: $picks, maxSelectionCount: max(1, CustomPhotoRules.maxPhotos - photos.photos.count), matching: .images) {
                            Text(busy ? "…" : app.t("photos.add")).frame(maxWidth: .infinity, minHeight: 50)
                        }
                        .buttonStyle(WebButtonStyle(filled: true, minHeight: 50))
                        .disabled(busy || photos.photos.count >= CustomPhotoRules.maxPhotos)
                        Text(app.t("photos.usage", ["n": photos.photos.count, "max": CustomPhotoRules.maxPhotos, "mb": String(format: "%.1f", Double(photos.usedBytes) / 1_048_576), "maxmb": CustomPhotoRules.maxTotalBytes / 1_048_576]))
                            .font(Web.font(12)).foregroundStyle(Web.muted)
                    }
                    ForEach(errors, id: \.self) { Text($0).font(Web.font(13)).foregroundStyle(Web.fg).accessibilityAddTraits(.isStaticText) }
                    if photos.photos.isEmpty && !locked { Text(app.t("photos.empty")).font(Web.font(14)).foregroundStyle(Web.muted).padding(.vertical, 20) }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 14) {
                        ForEach(photos.photos) { p in card(p, locked: locked) }
                    }
                    Text(app.t("photos.private")).font(Web.font(12)).foregroundStyle(Web.muted)
                    Text(app.t("photos.kept")).font(Web.font(12)).foregroundStyle(Web.muted)
                }
                .padding(.horizontal, 16).padding(.vertical, 14).frame(maxWidth: 560).frame(maxWidth: .infinity)
            }
        }
        .artScreen()
        .sheet(isPresented: $showPremium) { PremiumView() }
        .onChange(of: picks) { _, items in if !items.isEmpty { Task { await add(items) } } }
        .confirmationDialog(app.t("photos.deleteConfirm"), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button(app.t("photos.delete"), role: .destructive) {
                if let p = deleting {
                    photos.delete(p)
                    if store.save.inProgressFree?.puzzle.artworkId == p.artworkID { store.setProgress(daily: false, nil) }
                }
                deleting = nil
            }
            Button(app.t("common.cancel"), role: .cancel) { deleting = nil }
        }
    }

    private func card(_ p: CustomPhoto, locked: Bool) -> some View {
        let best = store.save.customRecords.filter { $0.key.hasPrefix("\(p.artworkID):") }.compactMap(\.value.bestTimeMs).min()
        return Button { if locked { showPremium = true } else { path.append(.play(p.artworkID)) } } label: {
            VStack(alignment: .leading, spacing: 2) {
                SquareThumb(image: photos.thumb(p), dim: locked)
                Text(p.name).font(Web.font(13, .semibold)).foregroundStyle(Web.fg).lineLimit(1).padding(.top, 4)
                Text(best.map { app.t("photos.best", ["time": ArtStats.formatTime($0)]) } ?? " ").font(Web.font(11)).foregroundStyle(Web.muted)
            }
        }
        .buttonStyle(.plain)
        .overlay(alignment: .topTrailing) {
            Button { deleting = p } label: { Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Web.fg).frame(width: 28, height: 28).background(Web.bg.opacity(0.85), in: Circle()).frame(width: 44, height: 44) }
                .accessibilityLabel("\(app.t("photos.delete")): \(p.name)")
        }
    }

    private func add(_ items: [PhotosPickerItem]) async {
        busy = true; errors = []
        for item in items {
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else { throw CustomPhotoStore.Failure.decode }
                try await photos.add(data: data, name: "Photo \(photos.photos.count + 1)")
            } catch let f as CustomPhotoStore.Failure {
                switch f {
                case .tooLarge: errors.append(app.t("photos.errSize"))
                case .limit: errors.append(app.t("photos.errLimit", ["max": CustomPhotoRules.maxPhotos]))
                case .quota: errors.append(app.t("photos.errQuota"))
                case .storage: errors.append(app.t("ios.art.errStorage"))
                case .decode: errors.append(app.t("photos.errDecode"))
                }
            } catch { errors.append(app.t("photos.errDecode")) }
        }
        picks = []; busy = false
    }
}
