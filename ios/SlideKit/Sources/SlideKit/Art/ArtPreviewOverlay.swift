import SwiftUI
import SlideCore

/// iPad: the preview of the finished painting lies right over the puzzle, at the puzzle's own size (like the web's preview), with its top edge
/// a little above the puzzle's top edge. The description sits to the right of the picture when there is room (landscape), under it otherwise.
/// A tap anywhere closes it.
struct ArtPreviewOverlay: View {
    @Environment(AppModel.self) private var app
    let artwork: PlayArtwork
    let image: UIImage
    let boardFrame: CGRect          // the puzzle, in this overlay's own coordinates
    let container: CGSize           // the overlay's size
    let onClose: () -> Void

    var body: some View {
        let geo = container
        return Group {
            let lift: CGFloat = 10
            let top = max(6, boardFrame.minY - lift)
            // a hair larger than the puzzle: the top edge is a little above the puzzle's, the bottom edge stays where the puzzle's is (nothing of it peeks out)
            let k = (boardFrame.maxY - top) / boardFrame.height
            let w = boardFrame.width * k, h = boardFrame.height * k
            let left = boardFrame.midX - w / 2
            let room = geo.width - (left + w) - 28           // beside the picture
            let beside = room >= 260
            ZStack(alignment: .topLeading) {
                Color.black.opacity(0.42).ignoresSafeArea().onTapGesture(perform: onClose)
                Image(uiImage: image).resizable().scaledToFit()
                    .frame(width: w, height: h)
                    .background(Web.bg)
                    .shadow(color: .black.opacity(0.35), radius: 22, y: 12)
                    .offset(x: left, y: top)
                    .accessibilityLabel(app.t("art.preview"))
                    .onTapGesture(perform: onClose)
                if !artwork.isCustom {
                    ScrollView {
                        ArtDetailsView(artwork: artwork).padding(16)
                    }
                    .frame(width: beside ? min(room, 400) : w, height: beside ? h : min(260, max(120, geo.height - (top + h) - 24)))
                    .background(Web.bg, in: RoundedRectangle(cornerRadius: 4))
                    .offset(x: beside ? left + w + 18 : left, y: beside ? top : top + h + 14)
                }
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Web.fg)
                        .frame(width: 36, height: 36).background(Web.bg.opacity(0.9), in: Circle()).frame(width: 44, height: 44)
                }
                .offset(x: left + w - 44, y: top)
                .accessibilityLabel(app.t("common.close"))
            }
            .frame(width: geo.width, height: geo.height, alignment: .topLeading)
        }
    }
}
