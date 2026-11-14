/**
 * Link previews for shared results. A link like  https://<site>/s/<artwork-id>/  opens a tiny static page whose
 * <meta> tags make social networks show the painting as a sliding puzzle (a 1200x630 image) and then
 * sends visitors on to the game.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { ARTWORKS } from '../src/games/art-slide/data';
import { moveTile, neighbors, solvedBoard } from '../src/games/art-slide/logic/board';
import { aspectOf, gridFor } from '../src/games/art-slide/logic/grid';
import { cellCount } from '../src/games/art-slide/logic/board';
import { rngFromString, pick } from '../src/utils/rng';
import type { Artwork } from '../src/games/art-slide/types';

export const OG_W = 1200;
export const OG_H = 630;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A few legal slides away from solved, so it looks like a puzzle in progress but stays recognisable. */
function sampleBoard(art: Artwork, steps: number) {
  const d = gridFor(aspectOf(art), 4);
  const rng = rngFromString(`og|${art.id}`);
  let board = solvedBoard(d);
  let blank = cellCount(d) - 1;
  let prev = -1;
  let last = { from: blank, to: blank };
  for (let i = 0; i < steps; i++) {
    const next = pick(rng, neighbors(blank, d).filter((c) => c !== prev));
    board = moveTile(board, d, next)!;
    last = { from: next, to: blank }; // the tile that was at `next` slid into `blank`
    prev = blank;
    blank = next;
  }
  return { d, board, blank, last };
}

/** The painting cut into puzzle tiles with gaps, one tile missing and one caught mid-slide. */
export async function buildOgImage(art: Artwork, publicDir = 'public'): Promise<Buffer> {
  const { d, board, last } = sampleBoard(art, 52);
  const margin = 54;
  const boxW = OG_W - margin * 2;
  const boxH = 470;
  const aspect = aspectOf(art);
  const bw = Math.round(Math.min(boxW, boxH * aspect));
  const bh = Math.round(bw / aspect);
  const left0 = Math.round((OG_W - bw) / 2);
  const top0 = 38 + Math.round((boxH - bh) / 2);
  const cw = bw / d.cols;
  const ch = bh / d.rows;
  const gap = 7;

  const img = await sharp(`${publicDir}${art.imageUrl}`).resize(bw, bh, { fit: 'fill' }).toBuffer();
  const comps: { input: Buffer; left: number; top: number }[] = [];
  for (let cell = 0; cell < board.length; cell++) {
    const id = board[cell];
    if (id === null) continue;
    const homeR = Math.floor(id / d.cols);
    const homeC = id % d.cols;
    const tile = await sharp(img)
      .extract({ left: Math.round(homeC * cw), top: Math.round(homeR * ch), width: Math.round(cw) - gap, height: Math.round(ch) - gap })
      .toBuffer();
    let r = Math.floor(cell / d.cols);
    let c = cell % d.cols;
    let x = c * cw;
    let y = r * ch;
    if (cell === last.to) {
      // caught mid-slide: 45% of the way back towards where it came from
      const fr = Math.floor(last.from / d.cols);
      const fc = last.from % d.cols;
      x += (fc - c) * cw * 0.18;
      y += (fr - r) * ch * 0.18;
    }
    comps.push({ input: tile, left: left0 + Math.round(x), top: top0 + Math.round(y) });
  }

  const caption = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
    <text x="${margin}" y="${OG_H - 62}" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="600" fill="#1a1a1a">${esc(art.title.length > 46 ? `${art.title.slice(0, 44)}…` : art.title)}</text>
    <text x="${margin}" y="${OG_H - 26}" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#6b6b6b">${esc(art.artist)}, ${esc(art.year)}</text>
    <text x="${OG_W - margin}" y="${OG_H - 30}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="300" letter-spacing="7" fill="#1a1a1a">ART SLIDE</text>
  </svg>`;
  comps.push({ input: Buffer.from(caption), left: 0, top: 0 });
  // the slot of the missing tile, so it reads as a puzzle
  const slot = await sharp({ create: { width: Math.round(cw) - gap, height: Math.round(ch) - gap, channels: 3, background: '#e7e7e4' } }).png().toBuffer();
  // empty slots under the tiles: the blank, and the cell the sliding tile is leaving
  for (const cell of [board.indexOf(null), last.to]) comps.unshift({ input: slot, left: left0 + Math.round((cell % d.cols) * cw), top: top0 + Math.round(Math.floor(cell / d.cols) * ch) });

  return sharp({ create: { width: OG_W, height: OG_H, channels: 3, background: '#f6f6f4' } }).composite(comps).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

/** The static page that carries the preview meta tags and then forwards people to the game. */
export function sharePageHtml(art: Artwork, site: string): string {
  const base = site.replace(/\/+$/, '');
  const image = `${base}/og/${art.id}.jpg`;
  const url = `${base}/s/${art.id}/`;
  const title = `${art.title} – ART SLIDE`;
  const desc = `${art.artist}, ${art.year}. Put this painting back together: a free sliding puzzle with ${ARTWORKS.length}+ masterpieces.`;
  const play = `/art-slide/play/${art.id}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(base + play)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ART SLIDE">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="${OG_W}">
<meta property="og:image:height" content="${OG_H}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<noscript><meta http-equiv="refresh" content="0; url=${esc(play)}"></noscript>
<script>location.replace(new URLSearchParams(location.search).has('d') ? '/art-slide/daily' : '${play}');</script>
</head>
<body><p><a href="${esc(play)}">${esc(art.title)}</a></p></body>
</html>
`;
}

export function writeShareAssets(outDir: string, site: string, only?: string[]) {
  fs.mkdirSync(`${outDir}/og`, { recursive: true });
  const list = only ? ARTWORKS.filter((a) => only.includes(a.id)) : ARTWORKS;
  return Promise.all(
    list.map(async (art) => {
      fs.writeFileSync(`${outDir}/og/${art.id}.jpg`, await buildOgImage(art));
      fs.mkdirSync(`${outDir}/s/${art.id}`, { recursive: true });
      fs.writeFileSync(`${outDir}/s/${art.id}/index.html`, sharePageHtml(art, site));
    }),
  ).then(() => list.length);
}
