/**
 * Writes the link-preview images (og/<id>.jpg) and share pages (s/<id>/index.html) for every artwork.
 *   vite-node scripts/make-share-assets.ts              -> into dist/ (runs as the last step of `npm run build`)
 *   vite-node scripts/make-share-assets.ts --dir public -> into public/ for local testing (git-ignored)
 * The absolute site address comes from SITE_URL (or CF_PAGES_URL on Cloudflare Pages).
 */
import { writeShareAssets, buildOgImage } from './share-assets-lib';
import { ARTWORKS } from '../src/games/art-slide/data';
import sharp from 'sharp';
import fs from 'node:fs';

const argDir = process.argv.indexOf('--dir');
const outDir = argDir > 0 ? process.argv[argDir + 1] : 'dist';
const site = process.env.SITE_URL || process.env.CF_PAGES_URL || '';
if (!site) console.warn('SITE_URL is not set: og:image will be a relative path. Social networks need an absolute address; set SITE_URL for production.');
const n = await writeShareAssets(outDir, site);
// A slightly disrupted artwork also represents the app itself on social previews.
fs.writeFileSync(`${outDir}/og.png`, await sharp(await buildOgImage(ARTWORKS[0])).png().toBuffer());
for (const game of ['word', 'big'] as const) {
  const label = game === 'word' ? 'WORD SLIDE' : 'BIG SLIDE';
  const destination = game === 'word' ? '/word-slide' : '/big-slide';
  const tileCount = game === 'word' ? 4 : 4;
  const tiles = Array.from({ length: tileCount * tileCount }, (_, i) => {
    const x = i % tileCount, y = Math.floor(i / tileCount);
    const blank = i === 10;
    const letter = game === 'word' ? 'SLIDEP UZZLEGAME'.replace(/ /g, '')[i] ?? 'A' : String((i * 7 + 3) % 15 + 1);
    return `<rect x="${240+x*105}" y="${78+y*105}" width="99" height="99" rx="5" fill="${blank ? '#d8d8d5' : '#fafaf7'}" stroke="#c6c6c1"/>${blank ? '' : `<text x="${289+x*105}" y="${140+y*105}" text-anchor="middle" font-size="36" font-family="Arial" fill="#242424">${letter}</text>`}`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#eeeae3"/>${tiles}<text x="735" y="282" font-family="Arial" font-size="52" letter-spacing="3" fill="#222">${label}</text><text x="735" y="325" font-family="Arial" font-size="21" fill="#666">A SLIDING PUZZLE</text></svg>`;
  const image = `/og/${game}.png`;
  fs.writeFileSync(`${outDir}${image}`, await sharp(Buffer.from(svg)).png().toBuffer());
  fs.mkdirSync(`${outDir}/s/${game}`, { recursive: true });
  const base = site.replace(/\\/+$/, '');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${label}</title><meta property="og:type" content="website"><meta property="og:site_name" content="${label}"><meta property="og:title" content="${label}"><meta property="og:description" content="Play ${label}, a free sliding puzzle."><meta property="og:image" content="${base}${image}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${base}${image}"><meta http-equiv="refresh" content="0;url=${destination}"></head><body><a href="${destination}">Play ${label}</a></body></html>`;
  fs.writeFileSync(`${outDir}/s/${game}/index.html`, html);
}
console.log(`share assets: ${n} images + pages in ${outDir}/ (site: ${site || 'relative'})`);
