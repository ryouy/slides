import Foundation
import Network

/// Is the device online? Used to hide ad space offline and to explain downloads.
@MainActor @Observable
public final class Reachability {
    public private(set) var isOnline = true
    private let monitor = NWPathMonitor()
    public init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in self?.isOnline = online }
        }
        monitor.start(queue: DispatchQueue(label: "reachability"))
    }
}
