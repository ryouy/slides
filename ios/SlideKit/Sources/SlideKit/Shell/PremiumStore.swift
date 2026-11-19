import Foundation
import StoreKit

/// Premium = a StoreKit-verified, unexpired, unrevoked subscription transaction of OUR product (works offline: StoreKit keeps the
/// signed transactions on the device). A closed purchase sheet alone never unlocks anything.
@MainActor @Observable
public final class PremiumStore {
    public enum Outcome { case success, cancelled, pending, failed, unavailable }

    public private(set) var isPremium = false
    /// True once StoreKit has been asked at least once. Until then ads stay hidden, so a Premium user never sees a flash of ad space.
    public private(set) var hasResolved = false
    public private(set) var expiresAt: Date?
    public private(set) var willRenew: Bool?
    public private(set) var inGrace = false
    public private(set) var displayPrice: String?
    public private(set) var productFound: Bool?
    /// Apple-signed transaction: what the server verifies before it hands out a Premium painting.
    public private(set) var signedTransaction: String?

    private var updates: Task<Void, Never>?
    private let productID: String = {
        (Bundle.main.object(forInfoDictionaryKey: "PremiumProductID") as? String).flatMap { $0.hasPrefix("$(") ? nil : $0 } ?? "invalid.premium.monthly"
    }()

    public init() {}

    func start() async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-debugPremium") { isPremium = true; hasResolved = true; return } // DEBUG builds only: never in Release
        #endif
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let t) = result { await t.finish() }
                await self?.refresh()
            }
        }
        await refresh()
    }

    private func product() async -> Product? { try? await Product.products(for: [productID]).first }

    public func refresh() async {
        var premium = false, exp: Date?, jws: String?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result, t.productID == productID, t.revocationDate == nil else { continue }
            if let e = t.expirationDate, e < Date() { continue }
            premium = true; exp = t.expirationDate; jws = result.jwsRepresentation
        }
        isPremium = premium; expiresAt = exp; signedTransaction = jws
        hasResolved = true // (offline is fine: StoreKit answers from the transactions already on the device)
        let p = await product()
        productFound = p != nil
        displayPrice = p?.displayPrice
        willRenew = nil; inGrace = false
        if premium, let status = try? await p?.subscription?.status.first {
            if case .verified(let info) = status.renewalInfo { willRenew = info.willAutoRenew }
            inGrace = status.state == .inGracePeriod
        }
    }

    public func purchase() async -> Outcome {
        guard let p = await product() else { return .unavailable }
        do {
            switch try await p.purchase() {
            case .success(let v):
                guard case .verified(let t) = v else { return .failed }
                await t.finish(); await refresh(); return .success
            case .userCancelled: return .cancelled
            case .pending: return .pending
            @unknown default: return .failed
            }
        } catch { return .failed }
    }

    public func restore() async -> Bool {
        do { try await AppStore.sync(); await refresh(); return true } catch { return false }
    }

    public func manageSubscription() async {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        try? await AppStore.showManageSubscriptions(in: scene)
    }
}
