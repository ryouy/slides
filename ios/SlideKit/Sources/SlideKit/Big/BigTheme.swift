import SwiftUI
import UIKit

/// Colour and type tokens of the web version (src/styles.css), light and dark. BIG SLIDE keeps its own web look inside the app.
enum BigTheme {
    private static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
    static let bg = dyn(0xFFFFFF, 0x121213)
    static let fg = dyn(0x1A1A1B, 0xF4F4F5)
    static let muted = dyn(0x6B6E70, 0x9A9DA0)
    static let line = dyn(0xD3D6DA, 0x3A3A3C)
    static let surface = dyn(0xF4F5F6, 0x1C1C1E)
    static let tile = dyn(0xE6E8EA, 0x3A3A3C)
    static let tileFg = dyn(0x1A1A1B, 0xF4F4F5)
    static let accent = dyn(0x1A1A1B, 0xF4F4F5)
    static let accentFg = dyn(0xFFFFFF, 0x121213)
    static let foundLine = dyn(0x4A90D9, 0x5AA2E6)
    static let gray = dyn(0x787C7E, 0x4A4A4D)
    static let yellow = dyn(0xC9B458, 0xB59F3B)
    static let bigFg = Color.white
    static func home(_ colorblind: Bool) -> Color { colorblind ? Color(UIColor(hex: 0xF5793A)) : dyn(0x6AAA64, 0x538D4E) }
    static func bigColor(_ id: Int) -> Color {
        switch id % 3 {
        case 0: dyn(0x3B6FD4, 0x4F82E0)
        case 1: dyn(0xE07A2F, 0xEC8C43)
        default: dyn(0x2F9E8F, 0x3FB3A3)
        }
    }
    static let logoBig = dyn(0x3B6FD4, 0x4F82E0)

    /// Helvetica Neue like the web's font stack, scaling with Dynamic Type.
    static func font(_ size: CGFloat, _ weight: Weight = .bold, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(weight.name, size: size, relativeTo: style)
    }
    enum Weight {
        case regular, medium, bold
        var name: String { switch self { case .regular: "HelveticaNeue"; case .medium: "HelveticaNeue-Medium"; case .bold: "HelveticaNeue-Bold" } }
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
    }
}

/// The web's quiet outlined button (`.btn`): 2px line border, bold letter-spaced text, 44pt minimum; `.primary` fills with the accent.
struct BigButtonStyle: ButtonStyle {
    var primary = false
    var large = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(BigTheme.font(large ? 16 : 14, .bold))
            .tracking(large ? 0.9 : 0.8)
            .foregroundStyle(primary ? BigTheme.accentFg : BigTheme.fg)
            .padding(.horizontal, 18)
            .padding(.vertical, large ? 14 : 10)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(RoundedRectangle(cornerRadius: 10).fill(primary ? BigTheme.accent : BigTheme.bg))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(primary ? BigTheme.accent : BigTheme.line, lineWidth: 2))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

/// Top bar of every mini-game screen: round back button, centred letter-spaced title, a line underneath.
struct BigTopBar<Right: View>: View {
    let title: String
    let backLabel: String
    let onBack: () -> Void
    var small = false
    @ViewBuilder var right: () -> Right
    var body: some View {
        ZStack {
            Text(title)
                .font(BigTheme.font(small ? 13 : 16, .bold))
                .tracking(small ? 1 : 1.9)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .foregroundStyle(BigTheme.fg)
                .padding(.horizontal, 64)
                .accessibilityAddTraits(.isHeader)
            HStack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left").font(.system(size: 19, weight: .regular)).foregroundStyle(BigTheme.fg)
                        .frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .accessibilityLabel(backLabel)
                Spacer()
                right()
            }
            .padding(.horizontal, 4)
        }
        .frame(height: 48)
        .overlay(alignment: .bottom) { Rectangle().fill(BigTheme.line).frame(height: 1) }
    }
}
extension BigTopBar where Right == EmptyView {
    init(title: String, backLabel: String, small: Bool = false, onBack: @escaping () -> Void) {
        self.init(title: title, backLabel: backLabel, onBack: onBack, small: small) { EmptyView() }
    }
}
