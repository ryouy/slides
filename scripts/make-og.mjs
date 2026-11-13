/** Builds public/og.png (social preview): a 3x3 sliding mosaic of paintings with one piece missing. */
import fs from 'node:fs';
import sharp from 'sharp';

const t = fs.readFileSync('src/games/art-slide/data/artworks.ts', 'utf8');
const all = JSON.parse(t.slice(t.indexOf('[\n'), t.lastIndexOf(']') + 1));
const pick = ['van-gogh-wheat-field-cypresses', 'hokusai-great-wave', 'monet-water-lilies', 'seurat-grande-jatte', 'vermeer-water-pitcher', 'van-gogh-bedroom', 'degas-dance-class', 'caillebotte-paris-street'];
const T = 200, G = 8, X0 = 560, Y0 = 7;
const comps = [];
for (let i = 0; i < pick.length; i++) {
  const a = all.find((x) => x.id === pick[i]);
  const buf = await sharp(`public${a.thumbnailUrl}`).resize(T, T, { fit: 'cover' }).toBuffer();
  comps.push({ input: buf, left: X0 + (i % 3) * (T + G), top: Y0 + Math.floor(i / 3) * (T + G) });
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="${X0 + 2 * (T + G)}" y="${Y0 + 2 * (T + G)}" width="${T}" height="${T}" fill="#eeeeee"/>
  <text x="60" y="290" font-family="Helvetica, Arial, sans-serif" font-size="92" font-weight="300" letter-spacing="14" fill="#111">ART</text>
  <text x="60" y="390" font-family="Helvetica, Arial, sans-serif" font-size="92" font-weight="300" letter-spacing="14" fill="#111">SLIDE</text>
  <text x="62" y="450" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#666">Reassemble a masterpiece.</text>
</svg>`;
await sharp(Buffer.from(svg)).composite(comps).png().toFile('public/og.png');
console.log('wrote public/og.png');
