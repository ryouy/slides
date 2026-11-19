# ART SLIDE for iOS

The iOS app is the existing React/Vite game bundled into a Capacitor (WKWebView) shell. **The web site is unchanged** and is built separately.
The app loads only its own bundled files (`dist-ios` → `ios/App/App/public`); no website is ever loaded.

## What is where

| Path | What |
|---|---|
| `src/…` | The games (shared with the web). iOS-only behaviour sits behind `IS_IOS` (`src/platform/target.ts`) |
| `src/platform/` | iOS-only TypeScript: native bridge, start-up, Premium (StoreKit) panel, download gate, ad banner controller |
| `ios/native/slide-native/` | Swift plugin: StoreKit 2, AdMob banner + Google UMP + ATT, Premium image downloads, records backup, haptics |
| `ios/App/` | Xcode project (Swift Package Manager; no CocoaPods) |
| `ios/Config/*.xcconfig` | Bundle ID, Team, product id, AdMob ids, version. **Edit these, not the Xcode UI** |
| `ios/App/Premium.storekit` | Local StoreKit test configuration (JPY 200 / month) |
| `ios/scripts/build-assets.ts` | Copies the 40 free paintings + all thumbnails into the bundle, writes a manifest, **fails** if a Premium full-size image or any file is missing |
| `ios/scripts/check-bundle.mjs` | Checks a built `App.app` for Premium leaks |
| `ios/e2e/` | Offline tests of the bundled build (Playwright, network cut) |
| `worker/apple.ts` | Server side: Apple-signed transaction check, Premium painting download, App Store Server Notifications V2 |

## Build (first time)

Requirements: Xcode 16+ (tested with Xcode 27.2), Node 22.

```bash
npm install
npm run ios:sync            # builds dist-ios (web assets + free paintings) and copies it into the Xcode project
open ios/App/App.xcodeproj  # then Run on a simulator
# command line:
cd ios/App && xcodebuild -project App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
node ../scripts/check-bundle.mjs build/Build/Products/Debug-iphonesimulator/App.app   # from ios/App
```

If `xcodebuild` says it needs Xcode: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
After adding paintings to the web data, run `npm run ios:sync` again (new paintings are Premium unless added to `src/premium/freeList.ts`).

## Values you must provide (nothing here is invented for you)

Create `ios/Config/Local.xcconfig` (git-ignored) — it overrides `Shared.xcconfig`:

```
PRODUCT_BUNDLE_IDENTIFIER = com.yourname.artslide
DEVELOPMENT_TEAM = ABCDE12345
PREMIUM_PRODUCT_ID = com.yourname.artslide.premium.monthly
ADMOB_APP_ID = ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
ADMOB_BANNER_UNIT_ID = ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
```

Until you do, the app builds with a placeholder Bundle ID (cannot be uploaded) and **Google's public TEST ad ids** (test ads only; real ads can never appear by accident).
Also change `invalid.premium.monthly` in `ios/App/Premium.storekit` to the same product id when testing purchases locally.

## Premium / in-app purchase (StoreKit 2)

1. Apple Developer → Identifiers: register the Bundle ID. App Store Connect → My Apps → New App with that Bundle ID.
2. Subscriptions → create a group, then an **auto-renewing monthly** product with your `PREMIUM_PRODUCT_ID`; set the price (about JPY 200) and localizations; add the Terms/Privacy URLs to the app page.
3. Local test: Xcode → Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration = `Premium.storekit`. Run on the simulator, subscribe (no real charge). Debug ▸ StoreKit ▸ Manage Transactions lets you expire, refund and cancel to test those paths.
4. Sandbox test: use a Sandbox Apple Account on a real device (App Store Connect → Users and Access → Sandbox).
5. Server (Cloudflare Worker): set `APPLE_BUNDLE_ID` and `APPLE_PRODUCT_ID` as Secrets/Variables. Premium painting downloads answer 503 until both are set. Set `APPLE_ALLOW_SANDBOX=true` **only** while testing with Sandbox/TestFlight; remove it for production.
6. App Store Connect → App → App Information → App Store Server Notifications → set the **Production** and **Sandbox** URL to `https://<your worker>/api/apple/notifications` (version 2). This delivers renewals, expiry and refunds. (The table `apple_subs` is created automatically.)

How Premium is decided: only from transactions StoreKit has verified on the device (works offline). The Worker re-verifies the Apple-signed transaction (certificate chain pinned to Apple Root CA G3, bundle id, product id, expiry, revocation, Sandbox flag) before it hands out a Premium painting.

## Ads (AdMob)

Adaptive banner only. Shown to Free users on calm screens (home, gallery, stats, settings), never during a puzzle; hidden for Premium, offline, or when an ad fails (no blank space). Google UMP asks for consent where required (EU/UK), then iOS App Tracking Transparency; the games work whatever is answered. Settings shows "Ad privacy settings" when UMP requires it.
Set the AdMob ids in `Local.xcconfig` (see above); create the app + a banner unit in the AdMob console. The web site keeps using AdMax; its scripts never run in the app.

## Offline behaviour

* Bundled: 40 free paintings (full size), all 404 thumbnails, all metadata/licences, translations, word list, all game logic. `npm run build:ios` fails if a Premium full-size image would be bundled.
* iOS daily painting: chosen only from the 40 free paintings (frozen pool `IOS_DAILY_POOLS` in `src/games/art-slide/logic/dailyPickIos.ts`; each cycle of 40 is reshuffled). Dates/numbers/JST rollover are the same as the web; the web rotation is untouched. WORD/BIG SLIDE dailies use the same on-device generators as the web.
* Premium paintings: downloaded once (Settings can download all / delete all), stored in Application Support, played offline afterwards.
* Records: kept in the web view storage **and** mirrored to `Application Support/records-backup.json`; restored automatically if the web view storage is ever empty.

## Tests

```bash
npm run typecheck && npm test && npm run build     # web + worker (includes worker/apple.test.ts and the iOS daily tests)
npx playwright test                                # web e2e
npm run build:ios && npx playwright test -c ios/e2e/playwright.ios.config.ts   # bundled iOS build with the network cut
```

## Not done yet / to verify by hand (see the report in the pull request)

* Sign in with Apple / Google Sign-In, Drive sync and linking an Apple purchase to a web account (Stripe) are **not implemented**; the app currently works account-free (Premium belongs to the Apple Account, restore via "Restore purchases").
* App icon, launch screen and the App Store privacy "nutrition label" are default / to be prepared.
* Results screen ad, interactive on-device tests of purchase and ads were not run (see report).
