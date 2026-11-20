import SwiftUI
import SlideCore

/// The paintings the player starred. Kept on this device only (its own small file, not part of the synced records, so the shared
/// record format with the web is untouched). Custom photos are not starred.
@MainActor @Observable
final class FavoriteStore {
    private(set) var ids: Set<String>
    @ObservationIgnored private let file = JSONFileStore<[String]>(name: "art-favorites")

    init() {
        ids = Set(file.load() ?? [])
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-demoFavorites") { ids = ["monet-water-lilies", "hokusai-great-wave", "van-gogh-bedroom", "bierstadt-mountain-brook"] } // screenshots only, never saved
        #endif
    }

    func contains(_ id: String) -> Bool { ids.contains(id) }
    func toggle(_ id: String) {
        if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
        file.save(ids.sorted())
    }
}
