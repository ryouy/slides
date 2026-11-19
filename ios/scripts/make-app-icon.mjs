// Renders the web favicon's design (public/favicon.svg) as the iOS app icon: 1024x1024, opaque, square (iOS rounds the corners itself).
// Usage: node ios/scripts/make-app-icon.mjs
import sharp from 'sharp';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#111"/><rect x="10" y="10" width="20" height="20" fill="#5b7fa6"/><rect x="34" y="10" width="20" height="20" fill="#d6a24a"/><rect x="10" y="34" width="20" height="20" fill="#b5533c"/></svg>`;
await sharp(Buffer.from(svg), { density: 1152 }).resize(1024, 1024).flatten({ background: '#111' }).removeAlpha().png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
console.log('app icon written (1024x1024, no alpha)');
