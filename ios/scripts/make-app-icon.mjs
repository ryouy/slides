// Makes the iOS app icon (1024x1024, opaque, square: iOS rounds the corners itself) from a source picture.
// Usage: node ios/scripts/make-app-icon.mjs [source.png]   (default: ios/scripts/app-icon-source.png)
import sharp from 'sharp';
const src = process.argv[2] ?? 'ios/scripts/app-icon-source.png';
await sharp(src).resize(1024, 1024, { fit: 'cover' }).flatten({ background: '#000' }).removeAlpha().png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
console.log(`app icon written from ${src} (1024x1024, no alpha)`);
