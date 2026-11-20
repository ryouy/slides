// Makes the iOS app icon (1024x1024, opaque) and the splash picture from ios/scripts/mona-face.jpg.
//   * the icon is the FIRST FRAME of the launch animation: the face cut into 5x5 tiles in the scrambled arrangement START below,
//     one tile missing (the blank), rounded tiles on black;
//   * the splash picture is the clean, complete face (the animation ends on it).
// The face is a crop of "Mona Lisa, by Leonardo da Vinci, from C2RMF retouched" (public domain, Wikimedia Commons).
// START (cell -> tile) must match `SplashView.start` in ios/SlideKit/Sources/SlideKit/Shell/SplashView.swift.
// Usage: node ios/scripts/make-app-icon.mjs
import sharp from 'sharp';
const N = 5, ICON = 1024, MARGIN = 10, GAP = 8;
const START = [14, 6, 21, 9, 2, 17, 11, 3, 19, 0, 8, 23, 5, 15, 12, 1, 22, 7, 13, 20, 4, 10, 24, 16, 18]; // tile 24 (the blank, bottom-right tile) starts at cell 22
const SRC = 'ios/scripts/mona-face.jpg';
const face = sharp(SRC);
const { width: W } = await face.metadata();
const cut = Math.floor(W / N);
const tile = Math.floor((ICON - 2 * MARGIN - (N - 1) * GAP) / N);
const r = 20;
const mask = Buffer.from(`<svg width="${tile}" height="${tile}"><rect width="${tile}" height="${tile}" rx="${r}" fill="#fff"/></svg>`);
const bevel = Buffer.from(`<svg width="${tile}" height="${tile}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".12" stop-color="#fff" stop-opacity="0"/><stop offset=".88" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient></defs><rect width="${tile}" height="${tile}" rx="${r}" fill="url(#g)"/><rect x="1" y="1" width="${tile - 2}" height="${tile - 2}" rx="${r - 1}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2"/></svg>`);
const layers = [];
for (let cell = 0; cell < N * N; cell++) {
  const t = START[cell];
  const x = MARGIN + (cell % N) * (tile + GAP), y = MARGIN + Math.floor(cell / N) * (tile + GAP);
  if (t === N * N - 1) { // the blank: a dark, flat tile
    layers.push({ input: await sharp({ create: { width: tile, height: tile, channels: 3, background: '#1c140e' } }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer(), left: x, top: y });
    continue;
  }
  const piece = await sharp(SRC).extract({ left: (t % N) * cut, top: Math.floor(t / N) * cut, width: cut, height: cut }).resize(tile, tile)
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const withBevel = await sharp(piece).composite([{ input: bevel }]).png().toBuffer();
  layers.push({ input: withBevel, left: x, top: y });
}
await sharp({ create: { width: ICON, height: ICON, channels: 3, background: '#000' } }).composite(layers).removeAlpha().png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
await sharp(SRC).resize(1250, 1250).png({ compressionLevel: 9 }).toFile('ios/App/App/Assets.xcassets/SplashArt.imageset/splash-art.png');
console.log('app icon (scrambled first frame) and splash picture (complete face) written');
