/**
 * Builds the ART SLIDE artwork set from official museum open-access APIs.
 *   node scripts/fetch-artworks.mjs
 * For every entry it (1) asks the museum API for the object, (2) REFUSES to continue unless the
 * object is flagged public domain and has an image, (3) downloads the image, converts it to WebP
 * (game image + thumbnail) into public/artworks/, and (4) writes src/games/art-slide/data/artworks.ts
 * with the source URL and licence for each work. Descriptions below are original text.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = 'public/artworks';
const OUT_TS = 'src/games/art-slide/data/artworks.ts';
const GAME_MAX = 1400; // longest side of the game image
const THUMB_MAX = 480;

const AIC_LICENSE = { license: 'CC0 1.0 (Public Domain)', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', licenseBasis: 'Art Institute of Chicago Open Access: API field is_public_domain = true (images of public-domain works are released under CC0)' };
const MET_LICENSE = { license: 'CC0 1.0 (The Met Open Access)', licenseUrl: 'https://www.metmuseum.org/about-the-met/policies-and-documents/open-access', licenseBasis: 'The Metropolitan Museum of Art Open Access: API field isPublicDomain = true (CC0)' };

const MANIFEST = [
  { id: 'seurat-grande-jatte', museum: 'aic', sid: 27992, title: 'A Sunday on La Grande Jatte', year: '1884–86', focus: [0.5, 0.5], description: 'Seurat built this scene of Parisians relaxing on an island in the Seine from thousands of tiny dots of pure colour, a technique known as pointillism.' },
  { id: 'van-gogh-bedroom', museum: 'aic', sid: 28560, focus: [0.5, 0.5], description: 'Van Gogh painted his own bedroom in Arles in the south of France, using flat, bright colours and a tilted perspective. He made three versions; this is the one in Chicago.' },
  { id: 'van-gogh-self-portrait', museum: 'aic', sid: 80607, focus: [0.5, 0.25], description: 'Painted in Paris, this self-portrait shows Van Gogh experimenting with short, directional brushstrokes inspired by the pointillist painters around him.' },
  { id: 'monet-water-lilies', museum: 'aic', sid: 16568, focus: [0.5, 0.5], description: 'One of Monet’s many views of the water-lily pond in his garden at Giverny, where he painted the surface of the water and its reflections rather than the horizon.' },
  { id: 'monet-stacks-of-wheat', museum: 'aic', sid: 14624, title: 'Stacks of Wheat (End of Day, Autumn)', focus: [0.5, 0.5], description: 'Monet painted the same haystacks near his home in Giverny again and again to capture how light and colour change with the season and the time of day.' },
  { id: 'caillebotte-paris-street', museum: 'aic', sid: 20684, focus: [0.5, 0.5], description: 'Caillebotte’s large view of a Paris intersection shows well-dressed pedestrians with umbrellas on wet cobblestones, a modern city seen with an almost photographic eye.' },
  { id: 'renoir-two-sisters', museum: 'aic', sid: 14655, year: '1881', focus: [0.5, 0.4], description: 'Renoir shows two young women on a terrace by the river, painted with soft, quick brushwork and a warm palette of reds, oranges and greens.' },
  { id: 'cassatt-childs-bath', museum: 'aic', sid: 111442, focus: [0.5, 0.5], description: 'Mary Cassatt composed this tender scene of a woman and a child from a high angle, influenced by the flat colours and bold design of Japanese woodblock prints.' },
  { id: 'toulouse-lautrec-moulin-rouge', museum: 'aic', sid: 61128, year: '1892–95', focus: [0.5, 0.5], description: 'Toulouse-Lautrec captured the nightlife of Montmartre with strong colours, cropped figures and a sharply cut-off composition that feels like a snapshot.' },
  { id: 'gauguin-day-of-the-god', museum: 'aic', sid: 27943, title: 'Day of the God (Mahana no atua)', focus: [0.5, 0.5], description: 'Gauguin’s colourful scene of Tahitian life shows a carved idol above a pool of bathers, painted in flat, saturated colours rather than realistic shading.' },
  { id: 'cezanne-basket-of-apples', museum: 'aic', sid: 111436, artist: 'Paul Cézanne', focus: [0.5, 0.5], description: 'Cézanne tilted the table and shifted viewpoints so the bottle, basket and fruit seem to float in a space of their own, an approach that inspired later modern art.' },
  { id: 'hokusai-shower-below-the-summit', museum: 'aic', sid: 87008, title: 'Shower Below the Summit', inset: [0.03, 0.025, 0.025, 0.02], focus: [0.5, 0.5], description: 'A woodblock print from Hokusai’s series of Mount Fuji views, showing a storm raging below the summit while the peak itself stays in clear sky.' },
  { id: 'vermeer-water-pitcher', museum: 'met', sid: 437881, focus: [0.5, 0.5], description: 'A young woman opens a window and holds a water pitcher in a quiet room, lit by soft daylight, in one of Vermeer’s calm domestic scenes.' },
  { id: 'van-gogh-wheat-field-cypresses', museum: 'met', sid: 436535, focus: [0.5, 0.5], description: 'Painted in 1889 in southern France, this view has swirling clouds and dark cypress trees rising from a golden wheat field.' },
  { id: 'sargent-madame-x', museum: 'met', sid: 12127, title: 'Madame X (Madame Pierre Gautreau)', focus: [0.5, 0.08], description: 'Sargent’s portrait of a Parisian socialite caused a scandal at the 1884 Salon, partly because of the daring neckline of the black dress.' },
  { id: 'rembrandt-aristotle-homer', museum: 'met', sid: 437394, artist: 'Rembrandt van Rijn', focus: [0.5, 0.5], description: 'The philosopher Aristotle rests a hand on a bust of the poet Homer in a portrait known for its rich golden light and deep, dark background.' },
  { id: 'hokusai-great-wave', museum: 'met', sid: 45434, title: 'The Great Wave off Kanagawa', year: 'ca. 1830–32', focus: [0.45, 0.5], description: 'The best-known Japanese woodblock print: a towering wave about to crash over fishing boats, with Mount Fuji small in the distance.' },
  { id: 'degas-dance-class', museum: 'met', sid: 438817, focus: [0.5, 0.5], description: 'Degas shows young ballet students waiting and stretching in a rehearsal room while their teacher looks on, a moment caught between the steps.' },
];

const today = new Date().toISOString().slice(0, 10);
const j = async (u) => {
  const r = await fetch(u, { headers: { 'User-Agent': 'slide-games-build-script/1.0', 'AIC-User-Agent': 'slide-games-build-script' } });
  if (!r.ok) throw new Error(`${u} -> HTTP ${r.status}`);
  return r.json();
};
const buf = async (u) => {
  const r = await fetch(u, { headers: { 'User-Agent': 'slide-games-build-script/1.0', 'AIC-User-Agent': 'slide-games-build-script' } });
  if (!r.ok) throw new Error(`${u} -> HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = [];

for (const m of MANIFEST) {
  let meta;
  if (m.museum === 'aic') {
    const d = (await j(`https://api.artic.edu/api/v1/artworks/${m.sid}?fields=id,title,artist_title,date_display,is_public_domain,image_id,classification_title`)).data;
    if (d.is_public_domain !== true || !d.image_id) throw new Error(`REFUSED: AIC ${m.sid} is not public domain / has no image`);
    meta = {
      title: m.title ?? d.title, artist: m.artist ?? d.artist_title, year: m.year ?? d.date_display,
      museum: 'Art Institute of Chicago', sourceUrl: `https://www.artic.edu/artworks/${d.id}`,
      imageSource: `https://www.artic.edu/iiif/2/${d.image_id}/full/1200,/0/default.jpg`, ...AIC_LICENSE,
    };
  } else {
    const d = await j(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${m.sid}`);
    if (d.isPublicDomain !== true || !d.primaryImage) throw new Error(`REFUSED: Met ${m.sid} is not public domain / has no image`);
    meta = {
      title: m.title ?? d.title, artist: m.artist ?? d.artistDisplayName, year: m.year ?? d.objectDate,
      museum: 'The Metropolitan Museum of Art', sourceUrl: d.objectURL, imageSource: d.primaryImage, ...MET_LICENSE,
    };
  }
  const src = await buf(meta.imageSource);
  // Met photographs are shot on a black studio background: trim it so tiles contain only painting
  let base = sharp(src).rotate();
  if (m.museum === 'met') {
    const trimmed = await base.trim({ threshold: 40 }).toBuffer();
    base = sharp(trimmed);
  }
  if (m.inset) {
    // optional manual crop (fractions of top, right, bottom, left): removes paper margins of prints
    const buf1 = await base.toBuffer();
    const { width: bw, height: bh } = await sharp(buf1).metadata();
    const [t, r, b2, l] = m.inset;
    base = sharp(buf1).extract({ left: Math.round(bw * l), top: Math.round(bh * t), width: Math.round(bw * (1 - l - r)), height: Math.round(bh * (1 - t - b2)) });
  }
  const img = base;
  const game = await img.clone().resize({ width: GAME_MAX, height: GAME_MAX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await img.clone().resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, `${m.id}.webp`), game.data);
  fs.writeFileSync(path.join(OUT_DIR, `${m.id}-thumb.webp`), thumb);
  out.push({
    id: m.id, title: meta.title, artist: meta.artist, year: meta.year,
    imageUrl: `/artworks/${m.id}.webp`, thumbnailUrl: `/artworks/${m.id}-thumb.webp`,
    width: game.info.width, height: game.info.height, focus: { x: m.focus[0], y: m.focus[1] },
    museum: meta.museum, sourceUrl: meta.sourceUrl, license: meta.license, licenseUrl: meta.licenseUrl, licenseBasis: meta.licenseBasis,
    sourceImageUrl: meta.imageSource, verifiedAt: today, description: m.description,
  });
  console.log('ok', m.id, `${game.info.width}x${game.info.height}`, `${Math.round(game.data.length / 1024)}KB`);
}

const ts = `/* AUTO-GENERATED by scripts/fetch-artworks.mjs on ${today}. Do not edit by hand: edit the manifest in the script and re-run it. */
import type { Artwork } from '../types';

export const ARTWORKS_VERSION = 'art1';

export const ARTWORKS: Artwork[] = ${JSON.stringify(out, null, 2)};
`;
fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });
fs.writeFileSync(OUT_TS, ts);
console.log(`wrote ${out.length} artworks to ${OUT_TS}`);
