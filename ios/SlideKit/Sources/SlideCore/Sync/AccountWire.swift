import Foundation

/// JSON shapes of the account endpoints (pure, so the client side of the contract is unit-tested).
public enum AccountWire {
    public struct AuthRequest: Encodable, Equatable {
        public let identityToken: String
        public let nonce: String
        public let authorizationCode: String?
        public init(identityToken: String, nonce: String, authorizationCode: String?) { self.identityToken = identityToken; self.nonce = nonce; self.authorizationCode = authorizationCode }
        enum K: String, CodingKey { case identityToken, nonce, authorizationCode }
        public func encode(to e: Encoder) throws {
            var c = e.container(keyedBy: K.self)
            try c.encode(identityToken, forKey: .identityToken)
            try c.encode(nonce, forKey: .nonce)
            try c.encodeIfPresent(authorizationCode, forKey: .authorizationCode) // omitted when nil
        }
    }
    public struct AuthReply: Decodable, Equatable { public let token: String; public let accountId: String }
    public struct StatusReply: Decodable, Equatable { public let premium: Bool }

    public enum Revoked: String, Equatable, Sendable { case revoked, skipped, failed, unknown }
    public struct DeleteReply: Equatable, Sendable { public let ok: Bool; public let revoked: Revoked }

    /// `authorizationCode` is the UTF-8 text of Apple's one-time code; empty / nil is omitted.
    public static func authBody(identityToken: String, nonce: String, authorizationCode: Data?) -> Data? {
        let code = authorizationCode.flatMap { String(data: $0, encoding: .utf8) }.flatMap { $0.isEmpty ? nil : $0 }
        let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]
        return try? e.encode(AuthRequest(identityToken: identityToken, nonce: nonce, authorizationCode: code))
    }
    public static func parseAuth(_ d: Data) -> AuthReply? {
        guard let r = try? JSONDecoder().decode(AuthReply.self, from: d), !r.token.isEmpty else { return nil }
        return r
    }
    /// A missing or unexpected `revoked` is `.unknown` (treated like "not revoked").
    public static func parseDelete(_ d: Data) -> DeleteReply? {
        guard let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], o["ok"] as? Bool == true else { return nil }
        return DeleteReply(ok: true, revoked: (o["revoked"] as? String).flatMap(Revoked.init(rawValue:)) ?? .unknown)
    }
    public static func parseStatus(_ d: Data) -> StatusReply? { try? JSONDecoder().decode(StatusReply.self, from: d) }
}
