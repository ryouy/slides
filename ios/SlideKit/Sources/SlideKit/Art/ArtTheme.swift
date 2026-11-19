import SwiftUI
import UIKit

/// The web app's colour tokens and type feel (src/styles.css, .art-theme), drawn in SwiftUI. Light/dark follow the app setting.
enum Web {
    private static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { t in
            let h = t.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((h >> 16) & 255) / 255, green: CGFloat((h >> 8) & 255) / 255, blue: CGFloat(h & 255) / 255, alpha: 1)
        })
    }
    static let bg = dyn(0xFFFFFF, 0x121213)
    static let fg = dyn(0x1A1A1B, 0xF4F4F5)
    static let muted = dyn(0x6B6E70, 0x9A9DA0)
    static let line = dyn(0xD3D6DA, 0x3A3A3C)
    static let surface = dyn(0xF4F5F6, 0x1C1C1E)

    /// Helvetica Neue like the web, scaled with Dynamic Type.
    static func font(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        let name: String
        switch weight {
        case .ultraLight, .thin, .light: name = "HelveticaNeue-Light"
        case .medium: name = "HelveticaNeue-Medium"
        case .semibold, .bold, .heavy, .black: name = "HelveticaNeue-Bold"
        default: name = "HelveticaNeue"
        }
        return .custom(name, size: size, relativeTo: style)
    }
}

/// Outlined rectangular button of the web (1 px line, 3 px radius, spaced caps-less labels).
struct WebButtonStyle: ButtonStyle {
    var filled = false
    var minHeight: CGFloat = 46
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Web.font(13, .medium))
            .foregroundStyle(filled ? Web.bg : Web.fg)
            .frame(maxWidth: .infinity, minHeight: minHeight)
            .background(filled ? Web.fg : Web.bg, in: RoundedRectangle(cornerRadius: 3))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(filled ? Web.fg : Web.line, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

/// The 48 pt top bar of the web: back chevron, spaced title, hairline below.
struct ArtTopBar<Trailing: View>: View {
    let title: String
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var app
    var trailing: Trailing
    init(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) { self.title = title; self.trailing = trailing() }
    var body: some View {
        ZStack {
            Text(title).font(Web.font(14, .semibold, relativeTo: .subheadline)).tracking(2).lineLimit(1).minimumScaleFactor(0.7)
                .foregroundStyle(Web.fg).accessibilityAddTraits(.isHeader).padding(.horizontal, 56)
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left").font(.system(size: 18, weight: .regular)).frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .accessibilityLabel(app.t("common.back"))
                Spacer()
                trailing
            }
        }
        .foregroundStyle(Web.fg)
        .frame(minHeight: 48)
        .overlay(alignment: .bottom) { Rectangle().fill(Web.line).frame(height: 1) }
    }
}

extension View {
    /// A pushed ART SLIDE screen: web background, no system bar (the screen draws its own `ArtTopBar`).
    func artScreen() -> some View {
        self.background(Web.bg.ignoresSafeArea()).toolbar(.hidden, for: .navigationBar)
    }
}

/// With the system bar hidden the edge swipe-back would stop working; this keeps it (every pushed screen can be swiped back).
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }
    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool { viewControllers.count > 1 }
}

enum Haptics {
    // Generators are kept and re-prepared so the tick fires at once and is not dropped when slides come quickly (user drags, SHUFFLE).
    @MainActor private static let slideGen: UIImpactFeedbackGenerator = { let g = UIImpactFeedbackGenerator(style: .rigid); g.prepare(); return g }()
    @MainActor private static let notifyGen = UINotificationFeedbackGenerator()
    @MainActor private static let tapGen = UIImpactFeedbackGenerator(style: .soft)
    /// A crisp tick for every tile that slides (by the player or by SHUFFLE).
    @MainActor static func slide() { slideGen.impactOccurred(intensity: 0.85); slideGen.prepare() }
    @MainActor static func success() { notifyGen.notificationOccurred(.success) }
    @MainActor static func tap() { tapGen.impactOccurred() }
    @MainActor static func prepare() { slideGen.prepare(); notifyGen.prepare() }
}

/// A square cell with the whole picture inside it (never cropped), like the web's `.gcard img`.
struct SquareThumb: View {
    let image: UIImage?
    var dim = false
    var body: some View {
        Color.clear.aspectRatio(1, contentMode: .fit)
            .overlay { if let image { Image(uiImage: image).resizable().scaledToFit().opacity(dim ? 0.72 : 1) } }
            .background(Web.surface)
            .clipped()
    }
}
