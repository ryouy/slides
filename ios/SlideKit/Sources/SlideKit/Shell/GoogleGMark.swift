import SwiftUI

/// The four-colour Google "G" (drawn from arcs, so it stays sharp at any size).
struct GoogleGMark: View {
    var body: some View {
        GeometryReader { geo in
            let d = min(geo.size.width, geo.size.height), lw = d * 0.2
            ZStack {
                arc(0, 45, Color(red: 0.26, green: 0.52, blue: 0.96), lw)
                arc(45, 150, Color(red: 0.20, green: 0.66, blue: 0.33), lw)
                arc(150, 210, Color(red: 0.98, green: 0.74, blue: 0.02), lw)
                arc(210, 315, Color(red: 0.92, green: 0.26, blue: 0.21), lw)
                Rectangle().fill(Color(red: 0.26, green: 0.52, blue: 0.96))
                    .frame(width: d * 0.5, height: lw)
                    .position(x: d * 0.75, y: d / 2)
            }
            .frame(width: d, height: d)
        }
    }
    private func arc(_ from: Double, _ to: Double, _ c: Color, _ lw: CGFloat) -> some View {
        Circle().inset(by: lw / 2).trim(from: from / 360, to: to / 360).stroke(c, style: StrokeStyle(lineWidth: lw, lineCap: .butt))
    }
}
