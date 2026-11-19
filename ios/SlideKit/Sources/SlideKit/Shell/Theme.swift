import SwiftUI

/// Native iOS look: system colours and fonts, one accent. Games use these so light/dark mode and Dynamic Type just work.
public enum Theme {
    public static let accent = Color.accentColor
    public static let tile = Color(.secondarySystemBackground)
    public static let tileBorder = Color(.separator)
    public static let cardBackground = Color(.secondarySystemGroupedBackground)
    /// Clear / correct / warning colours; `colorblind` swaps green/red for blue/orange.
    public static func good(_ colorblind: Bool) -> Color { colorblind ? .blue : .green }
    public static func bad(_ colorblind: Bool) -> Color { colorblind ? .orange : .red }
}

public extension View {
    /// The standard large rounded primary button.
    func primaryButton() -> some View { self.buttonStyle(.borderedProminent).controlSize(.large).buttonBorderShape(.capsule) }
    func secondaryButton() -> some View { self.buttonStyle(.bordered).controlSize(.large).buttonBorderShape(.capsule) }
}
