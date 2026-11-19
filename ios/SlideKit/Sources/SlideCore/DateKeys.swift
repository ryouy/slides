import Foundation

/// Port of src/utils/date.ts: daily puzzles roll over at 0:00 Japan Standard Time, whatever the device's time zone.
public enum DateKeys {
    /// Daily #1 is this date (shared by all games).
    public static let dailyEpoch = "2026-11-01"
    static let jstOffset: TimeInterval = 9 * 3600

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// YYYY-MM-DD in JST.
    public static func jstDateKey(_ now: Date = Date()) -> String {
        formatter.string(from: now.addingTimeInterval(jstOffset))
    }

    static func dayNumber(_ key: String) -> Int {
        guard let d = formatter.date(from: key) else { return 0 }
        return Int((d.timeIntervalSince1970 / 86400).rounded(.down))
    }

    public static func dailyNumber(_ key: String) -> Int { dayNumber(key) - dayNumber(dailyEpoch) + 1 }
    public static func addDays(_ key: String, _ n: Int) -> String {
        guard let d = formatter.date(from: key) else { return key }
        return formatter.string(from: d.addingTimeInterval(Double(n) * 86400))
    }
}
