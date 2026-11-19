import Foundation
import CryptoKit

/// Sign in with Apple: the request carries the lowercase hex SHA-256 of a random string, the server gets the raw string.
public enum AppleNonce {
    public static func random(bytes: Int = 32) -> String {
        var g = SystemRandomNumberGenerator()
        return (0..<bytes).map { _ in String(format: "%02x", UInt8.random(in: 0...255, using: &g)) }.joined()
    }
    public static func sha256Hex(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
