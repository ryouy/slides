// swift-tools-version: 5.9
import PackageDescription

// SlideCore: game logic only (Foundation, no UI) so `swift test` runs it on the Mac.
// SlideKit : SwiftUI screens + StoreKit / AdMob / downloads. The Xcode app target only contains the @main entry.
let package = Package(
    name: "SlideKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "SlideCore", targets: ["SlideCore"]),
        .library(name: "SlideKit", targets: ["SlideKit"]),
    ],
    dependencies: [
        .package(url: "https://github.com/googleads/swift-package-manager-google-mobile-ads.git", from: "13.0.0"),
        .package(url: "https://github.com/googleads/swift-package-manager-google-user-messaging-platform.git", from: "3.0.0"),
    ],
    targets: [
        .target(name: "SlideCore"),
        .target(
            name: "SlideKit",
            dependencies: [
                "SlideCore",
                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads", condition: .when(platforms: [.iOS])),
                .product(name: "GoogleUserMessagingPlatform", package: "swift-package-manager-google-user-messaging-platform", condition: .when(platforms: [.iOS])),
            ]
        ),
        .testTarget(name: "SlideCoreTests", dependencies: ["SlideCore"], resources: [.copy("Golden")]),
    ]
)
