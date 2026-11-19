import SwiftUI
import UIKit
import SlideCore

/// Colours and shared controls of WORD SLIDE: the same tokens as the web version's src/styles.css (light / dark).
enum WT {
    static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        func ui(_ v: UInt32) -> UIColor { UIColor(red: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1) }
        return Color(UIColor { $0.userInterfaceStyle == .dark ? ui(dark) : ui(light) })
    }
    static let bg = dyn(0xffffff, 0x121213)
    static let fg = dyn(0x1a1a1b, 0xf4f4f5)
    static let muted = dyn(0x6b6e70, 0x9a9da0)
    static let line = dyn(0xd3d6da, 0x3a3a3c)
    static let surface = dyn(0xf4f5f6, 0x1c1c1e)
    static let tile = dyn(0xe6e8ea, 0x3a3a3c)
    static let found = dyn(0xcfe3f7, 0x1f3b57)
    static let foundLine = dyn(0x4a90d9, 0x5aa2e6)
    static let accent = dyn(0x1a1a1b, 0xf4f4f5)
    static let accentFg = dyn(0xffffff, 0x121213)
    static let gray = dyn(0x787c7e, 0x4a4a4d)

    static func green(_ cb: Bool) -> Color { cb ? Color(red: 0xf5 / 255, green: 0x79 / 255, blue: 0x3a / 255) : dyn(0x6aaa64, 0x538d4e) }
    static func yellow(_ cb: Bool) -> Color { cb ? Color(red: 0x85 / 255, green: 0xc0 / 255, blue: 0xf9 / 255) : dyn(0xc9b458, 0xb59f3b) }
    static func mark(_ m: WordMark, _ cb: Bool) -> Color { switch m { case .green: green(cb); case .yellow: yellow(cb); case .gray: gray } }
    /// Text on a mark colour (the web: white, dark on yellow in colour-blind mode).
    static func markFg(_ m: WordMark, _ cb: Bool) -> Color { m == .yellow && cb ? Color(white: 0.07) : .white }
    static func markSymbol(_ m: WordMark) -> String { switch m { case .green: "●"; case .yellow: "◆"; case .gray: "×" } }
}

/// Haptics for the board (light tap per slide, success when cleared).
@MainActor enum WordHaptics {
    static let impact = UIImpactFeedbackGenerator(style: .light)
    static let select = UISelectionFeedbackGenerator()
    static let notify = UINotificationFeedbackGenerator()
    static func slide() { impact.impactOccurred(intensity: 0.7) }
    static func tap() { select.selectionChanged() }
    static func clear() { notify.notificationOccurred(.success) }
    static func soft() { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
}

/// The web's `.btn`: 2pt line border, 10pt corners, bold tracked label, 44pt minimum height.
struct WordButtonStyle: ButtonStyle {
    var primary = false
    var big = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: big ? 16 : 15, weight: .bold))
            .tracking(0.9)
            .foregroundStyle(primary ? WT.accentFg : WT.fg)
            .padding(.horizontal, 18)
            .padding(.vertical, big ? 14 : 10)
            .frame(minHeight: 44)
            .frame(maxWidth: big ? .infinity : nil)
            .background(RoundedRectangle(cornerRadius: 10).fill(primary ? WT.accent : WT.bg))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(primary ? WT.accent : WT.line, lineWidth: 2))
            .opacity(enabled ? 1 : 0.45)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

/// Top bar: round back button, tracked title, optional trailing content, hairline below (the web's `.topbar`).
struct WordTopBar<Trailing: View>: View {
    @Environment(AppModel.self) private var app
    let title: String
    let onBack: () -> Void
    @ViewBuilder var trailing: () -> Trailing
    var body: some View {
        ZStack {
            Text(title).font(.system(size: 16, weight: .heavy)).tracking(1.9).foregroundStyle(WT.fg).lineLimit(1).minimumScaleFactor(0.7)
                .padding(.horizontal, 64)
            HStack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left").font(.system(size: 18, weight: .regular)).foregroundStyle(WT.fg)
                        .frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .accessibilityLabel(app.t("common.back"))
                Spacer()
                trailing().frame(minWidth: 44, alignment: .trailing)
            }
        }
        .frame(height: 48)
        .padding(.horizontal, 4)
        .overlay(alignment: .bottom) { Rectangle().fill(WT.line).frame(height: 1) }
    }
}
extension WordTopBar where Trailing == EmptyView {
    init(title: String, onBack: @escaping () -> Void) { self.init(title: title, onBack: onBack) { EmptyView() } }
}
