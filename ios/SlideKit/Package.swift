// swift-tools-version: 5.9
import PackageDescription
import Foundation

// `SLIDE_CORE_ONLY=1 swift test` builds and tests only the logic (SlideKit imports UIKit/AdMob, which do not exist on the Mac).
let coreOnly = ProcessInfo.processInfo.environment["SLIDE_CORE_ONLY"] != nil

// SlideCore: game logic only (Foundation, no UI) so `swift test` runs it on the Mac.
// SlideKit : SwiftUI screens + StoreKit / AdMob / downloads. The Xcode app target only contains the @main entry.
let package = Package(
    name: "SlideKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "SlideCore", targets: ["SlideCore"]),
    ] + (coreOnly ? [] : [.library(name: "SlideKit", targets: ["SlideKit"])]),
    dependencies: coreOnly ? [] : [
        .package(url: "https://github.com/googleads/swift-package-manager-google-mobile-ads.git", from: "13.0.0"),
        .package(url: "https://github.com/googleads/swift-package-manager-google-user-messaging-platform.git", from: "3.0.0"),
        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", from: "8.0.0"),
    ],
    targets: [
        .target(name: "SlideCore"),
    ] + (coreOnly ? [] : [
        .target(
            name: "SlideKit",
            dependencies: [
                "SlideCore",
                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads", condition: .when(platforms: [.iOS])),
                .product(name: "GoogleUserMessagingPlatform", package: "swift-package-manager-google-user-messaging-platform", condition: .when(platforms: [.iOS])),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS", condition: .when(platforms: [.iOS])),
                .product(name: "GoogleSignInSwift", package: "GoogleSignIn-iOS", condition: .when(platforms: [.iOS])),
            ]
        ),
    ]) + [
        .testTarget(name: "SlideCoreTests", dependencies: ["SlideCore"], resources: [.copy("Golden")]),
    ]
)
