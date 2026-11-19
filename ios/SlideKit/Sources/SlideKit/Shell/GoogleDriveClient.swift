import Foundation
import SlideCore

/// Google Drive REST (HTTPS only) for the hidden appDataFolder file shared with the web app. The bearer token comes from `token()` per call and is never logged.
struct GoogleDriveClient: DriveTransport {
    static let fileName = "slides-art-records.json"
    let token: @Sendable () async throws -> String
    private let api = "https://www.googleapis.com/drive/v3"
    private let upload = "https://www.googleapis.com/upload/drive/v3"

    private func call(_ url: String, method: String = "GET", body: Data? = nil, contentType: String? = nil) async throws -> Data {
        guard let u = URL(string: url), u.scheme == "https" else { throw DriveTransportError.unavailable }
        let t: String
        do { t = try await token() } catch GoogleAccountStore.TokenError.expired { throw DriveTransportError.auth } catch { throw DriveTransportError.unavailable }
        var req = URLRequest(url: u, timeoutInterval: 30)
        req.httpMethod = method
        req.httpShouldHandleCookies = false
        req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        if let contentType { req.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        req.httpBody = body
        let cfg = URLSessionConfiguration.ephemeral
        cfg.httpCookieAcceptPolicy = .never
        do {
            let (d, r) = try await URLSession(configuration: cfg).data(for: req)
            guard let h = r as? HTTPURLResponse else { throw DriveTransportError.unavailable }
            if h.statusCode == 401 || h.statusCode == 403 { throw DriveTransportError.auth }
            guard (200..<300).contains(h.statusCode) else { throw DriveTransportError.unavailable }
            return d
        } catch let e as DriveTransportError { throw e } catch { throw DriveTransportError.unavailable }
    }

    func read() async throws -> DriveRemote {
        var c = URLComponents(string: "\(api)/files")!
        c.queryItems = [.init(name: "spaces", value: "appDataFolder"), .init(name: "q", value: "name='\(Self.fileName)'"), .init(name: "fields", value: "files(id)"), .init(name: "pageSize", value: "10")]
        struct List: Decodable { struct F: Decodable { let id: String }; let files: [F]? }
        guard let listURL = c.url?.absoluteString else { throw DriveTransportError.unavailable }
        let list = try JSONDecoder().decode(List.self, from: try await call(listURL))
        guard let id = list.files?.first?.id else { return .empty }
        guard let esc = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { throw DriveTransportError.unavailable }
        let bytes = try await call("\(api)/files/\(esc)?alt=media")
        do { return .doc(fileId: id, doc: try DriveDoc.parse(bytes)) }
        catch DriveDoc.ReadError.newerSchema { return .unreadable(fileId: id, newer: true) }
        catch { return .unreadable(fileId: id, newer: false) }
    }

    func write(_ doc: DriveDoc, fileId: String?) async throws -> String {
        let body = doc.jsonData()
        if let fileId, let esc = fileId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) {
            _ = try await call("\(upload)/files/\(esc)?uploadType=media", method: "PATCH", body: body, contentType: "application/json")
            return fileId
        }
        let boundary = "slides\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        var m = Data()
        m.append(Data("--\(boundary)\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{\"name\":\"\(Self.fileName)\",\"parents\":[\"appDataFolder\"]}\r\n".utf8))
        m.append(Data("--\(boundary)\r\nContent-Type: application/json\r\n\r\n".utf8)); m.append(body); m.append(Data("\r\n--\(boundary)--".utf8))
        let r = try await call("\(upload)/files?uploadType=multipart&fields=id", method: "POST", body: m, contentType: "multipart/related; boundary=\(boundary)")
        struct Created: Decodable { let id: String }
        guard let c = try? JSONDecoder().decode(Created.self, from: r) else { throw DriveTransportError.unavailable }
        return c.id
    }
}
