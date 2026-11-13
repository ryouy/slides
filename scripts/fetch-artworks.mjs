/**
 * Builds the ART SLIDE artwork set.
 *   node scripts/fetch-artworks.mjs            # download what is missing, regenerate the data file
 *   node scripts/fetch-artworks.mjs --force    # re-download every image
 *
 * Inputs:  scripts/selection.json     (Art Institute of Chicago picks, from select-artworks.mjs)
 *          scripts/met-cache.json     (The Met works, verified earlier via the Met Open Access API)
 *          scripts/descriptions.json  (hand-written descriptions of the first release)
 * For every Art Institute work it asks the API again and REFUSES to continue unless the object is
 * flagged public domain and has an image. Images are converted to WebP (game image + thumbnail)
 * in public/artworks/, and src/games/art-slide/data/artworks.ts is written with the source URL,
 * licence and verification date of every work.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const FORCE = process.argv.includes('--force');
const OUT_DIR = 'public/artworks';
const OUT_TS = 'src/games/art-slide/data/artworks.ts';
const GAME_MAX = 1200; // longest side of the game image
const THUMB_MAX = 420;
const today = new Date().toISOString().slice(0, 10);
const UA = { 'User-Agent': 'slide-games-build-script/1.0', 'AIC-User-Agent': 'slide-games-build-script' };

const AIC_LICENSE = { license: 'CC0 1.0 (Public Domain)', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', licenseBasis: 'Art Institute of Chicago Open Access: API field is_public_domain = true (images of public-domain works are released under CC0)' };

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const selection = read('scripts/selection.json');
const metCache = read('scripts/met-cache.json');
const descriptions = read('scripts/descriptions.json');
const existingAic = new Map(read('scripts/aic-existing.json').map((a) => [a.sid, a]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, asJson) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(250 + attempt * 2000);
    const r = await fetch(url, { headers: UA });
    if (r.status === 429) continue;
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return asJson ? r.json() : Buffer.from(await r.arrayBuffer());
  }
  throw new Error(`${url} -> rate limited`);
}

/* ---------- naming ---------- */
const NAME_FIX = {
  'Hilaire Germain Edgar Degas': 'Edgar Degas', 'Jean Baptiste Camille Corot': 'Camille Corot', 'Jean François Millet': 'Jean-François Millet',
  'Paul Cezanne': 'Paul Cézanne', 'Joaquín Sorolla y Bastida': 'Joaquín Sorolla', 'Jean Auguste Dominique Ingres': 'Jean-Auguste-Dominique Ingres',
  'Jacques Louis David': 'Jacques-Louis David', 'Charles François Daubigny': 'Charles-François Daubigny', 'Joseph Mallord William Turner': 'J.M.W. Turner',
  'Pierre-Auguste Renoir': 'Pierre-Auguste Renoir',
};
const TITLE_FIX = {
  27992: 'A Sunday on La Grande Jatte', 27943: 'Day of the God (Mahana no atua)', 14624: 'Stacks of Wheat (End of Day, Autumn)', 87008: 'Shower Below the Summit',
  28849: 'A City Park', 81558: 'Acrobats at the Cirque Fernando', 14574: 'Degas and His Niece Lucie', 16487: "The Bay of Marseille, Seen from L'Estaque",
};
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s) => fold(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lastName = (a) => {
  const parts = fold(a).replace(/\./g, '').split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
};
function cleanTitle(sid, raw, kind) {
  if (TITLE_FIX[sid]) return TITLE_FIX[sid];
  let t = raw.split(/, from the series/i)[0].replace(/\s+[—–-]\s+\d{4}$/, '').trim();
  if (kind === 'print') t = t.replace(/\s*\([^)]*\)/g, '').replace(/^No\. \d+:\s*/, '');
  return t.length > 64 ? t.slice(0, 61).replace(/\s+\S*$/, '') + '…' : t;
}

/* ---------- grouping fields ---------- */
const THEMES = ['Landscape', 'Sea & Water', 'City & Street', 'Portrait', 'Still Life & Flowers', 'People & Daily Life', 'Myth & Religion', 'Japanese Prints'];
// Editorial theme per work (the keyword rules below are only a fallback for newly added works).
const L = 'Landscape', W = 'Sea & Water', C = 'City & Street', P = 'Portrait', S = 'Still Life & Flowers', D = 'People & Daily Life', M = 'Myth & Religion', J = 'Japanese Prints';
const THEME_BY_ID = {
  'monet-stacks-of-wheat-end-of-summer': L, 'monet-stacks-of-wheat': L, 'monet-water-lilies': W, 'monet-cliff-walk-at-pourville': W, 'monet-the-beach-at-sainte-adresse': W, 'monet-bordighera': L,
  'van-gogh-bedroom': D, 'van-gogh-self-portrait': P, 'gogh-a-peasant-woman-digging-in-front-of-her-cottage': D, 'gogh-fishing-in-spring-the-pont-de-clichy-asnieres': W, 'gogh-madame-roulin-rocking-the-cradle-la-berceuse': P,
  'van-gogh-wheat-field-cypresses': L,
  'renoir-two-sisters': P, 'renoir-acrobats-at-the-cirque-fernando': D, 'renoir-woman-at-the-piano': D,
  'degas-the-millinery-shop': D, 'degas-yellow-dancers-in-the-wings': D, 'degas-degas-and-his-niece-lucie': P, 'degas-dance-class': D,
  'cassatt-childs-bath': D, 'cassatt-on-a-balcony': D, 'seurat-grande-jatte': D, 'caillebotte-paris-street': C,
  'toulouse-lautrec-moulin-rouge': C, 'toulouse-lautrec-moulin-de-la-galette': C, 'toulouse-lautrec-ballet-dancers': D,
  'gauguin-arlesiennes-mistral': D, 'gauguin-merahi-metua-no-tehamana-tehamana-has-many-paren': P, 'gauguin-day-of-the-god': D,
  'cezanne-basket-of-apples': S, 'cezanne-the-bay-of-marseille-seen-from-l-estaque': W, 'cezanne-auvers-panoramic-view': L,
  'pissarro-the-crystal-palace': C, 'pissarro-the-banks-of-the-marne-in-winter': L,
  'sisley-the-seine-at-port-marly-piles-of-sand': W, 'sisley-watering-place-at-marly': L,
  'morisot-woman-at-her-toilette': D, 'morisot-woman-in-a-garden': D, 'manet-woman-reading': D, 'manet-sea-view-calm-weather-vue-de-mer-temps-calme': W,
  'whistler-violet-and-silver-the-deep-sea': W, 'whistler-trouville-grey-and-green-the-silver-sea': W,
  'sargent-the-fountain-villa-torlonia-frascati-italy': D, 'sargent-madame-paul-escudier-louise-lefevre': P, 'sargent-venetian-glass-workers': D, 'sargent-madame-x': P,
  'homer-the-herring-net': W, 'homer-croquet-scene': D, 'eakins-riter-fitzgerald': P, 'rousseau-sawmill-outskirts-of-paris': C,
  'corot-interrupted-reading': P, 'corot-wounded-eurydice': M, 'courbet-mere-gregoire': P, 'courbet-the-rock-of-hautepierre': L,
  'millet-peasants-bringing-home-a-calf-born-in-the-fields': D, 'millet-the-keeper-of-the-flock': D, 'constable-stoke-by-nayland': L,
  'rijn-old-man-with-a-gold-chain': P, 'rembrandt-aristotle-homer': P, 'rubens-the-holy-family-with-saints-elizabeth-and-john-th': M, 'hals-portrait-of-a-lady': P,
  'ruisdael-landscape-with-the-ruins-of-the-castle-of-egmon': L, 'cole-distant-view-of-niagara-falls': L, 'cole-new-england-scenery': L, 'church-view-of-cotopaxi': L, 'bierstadt-mountain-brook': L,
  'inness-early-morning-tarpon-springs': L, 'inness-the-home-of-the-heron': L, 'hassam-new-england-headlands': W, 'hassam-new-york-street': C, 'hassam-the-little-pond-appledore': W,
  'chase-a-city-park': C, 'chase-wind-swept-sands': L, 'munch-the-girl-by-the-window': P, 'signac-les-andelys-cote-d-aval': W, 'gainsborough-sarah-dupont': P,
  'fantin-latour-still-life-corner-of-a-table': S, 'fantin-latour-roses-in-a-bowl': S, 'redon-still-life-with-flowers': S, 'redon-flowers-poppies-and-daisies': S,
  'lorrain-view-of-delphi-with-a-procession': L, 'ingres-amedee-david-the-comte-de-pastoret': P, 'david-madame-de-pastoret-and-her-son': P, 'poussin-landscape-with-saint-john-on-patmos': M,
  'panini-festival-in-piazza-navona': C, 'sorolla-rocks-at-the-lighthouse-biarritz': W, 'zorn-portrait-study-of-a-man': P, 'henri-himself': P,
  'heade-magnolias-on-light-blue-velvet-cloth': S, 'harnett-just-dessert': S, 'copley-daniel-hubbard': P, 'daubigny-the-marsh': L, 'rousseau-springtime': L,
  'jongkind-entrance-to-the-port-of-honfleur': W, 'turner-fishing-boats-with-hucksters-bargaining-for-fish': W, 'guardi-the-grand-canal-venice': W, 'bellotto-view-of-pirna-with-the-fortress-of-sonnenstein': C,
  'vermeer-water-pitcher': D,
};
function themeOf(id, title, subjects, kind) {
  if (THEME_BY_ID[id]) return THEME_BY_ID[id];
  if (kind === 'print') return J;
  const t = `${title} ${subjects.join(' ')}`.toLowerCase();
  if (/christian|religio|biblical|\bsaint|virgin|madonna|mytholog|holy family|angels?\b|resurrection/.test(t)) return 'Myth & Religion';
  if (/still life|bouquet|chrysanthemum|\broses\b|\bflowers\b|magnolia|poppies|\bvase\b/.test(t)) return 'Still Life & Flowers';
  if (/portrait|self-portrait|\bmadame\b|\bmrs\.|\blady\b|herself|\bgirl\b/.test(t)) return 'Portrait';
  if (/\bsea\b|coast|beach|marine|seascape|harbou?r|\bport\b|ship|sailing|water lil|\bpond\b|\bwave|\bboats?\b|fishing|\bbay\b|canal|nymphae|\bwater\b/.test(t)) return 'Sea & Water';
  if (/cityscape|urban life|\bstreet\b|townscape|city park|\bparis\b|\bpark\b|piazza|\btowns?\b/.test(t)) return 'City & Street';
  if (/landscape|countryside|\bfield|\btrees?\b|mountain|valley|\bhills?\b|garden|rural|cliff|marsh|seasons|wheat|nature/.test(t)) return 'Landscape';
  return 'People & Daily Life';
}
function eraOf(y) {
  if (y < 1700) return 'Before 1700';
  if (y < 1800) return '1700s';
  if (y < 1850) return '1800–1849';
  if (y < 1880) return '1850–1879';
  if (y < 1900) return '1880–1899';
  return '1900s';
}
const STYLE_WORDS = new Set(['Impressionism', 'Post-Impressionism', 'Pointillism', 'Realism', 'Baroque', 'Rococo', 'Mannerism', 'Barbizon School']);
function autoDescription({ theme, artist, date, medium, style, origin }) {
  const kind = { Landscape: 'A landscape', 'Sea & Water': 'A scene of the sea, a coast or a river', 'City & Street': 'A scene of city life', Portrait: 'A portrait', 'Still Life & Flowers': 'A still life', 'People & Daily Life': 'A scene of people and everyday life', 'Myth & Religion': 'A religious or mythological scene', 'Japanese Prints': 'A Japanese woodblock print' }[theme];
  let s = `${kind} by ${artist}, made ${date ? `in ${date.replace(/^c\.\s*/i, 'around ')}` : 'in the 1800s'}${medium ? `, ${medium.toLowerCase().replace(/\.$/, '')}` : ''}.`;
  if (style && STYLE_WORDS.has(style)) s += ` It is associated with ${style}.`;
  if (origin && origin !== 'United States' && origin.length < 24) s += ` Made in ${origin}.`;
  return s;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = [];

async function makeImages(m) {
  const files = { game: path.join(OUT_DIR, `${m.id}.webp`), thumb: path.join(OUT_DIR, `${m.id}-thumb.webp`) };
  let width, height;
  if (!FORCE && fs.existsSync(files.game) && fs.existsSync(files.thumb)) {
    ({ width, height } = await sharp(files.game).metadata());
    return { width, height };
  }
  const src = await get(m.imageSource, false);
  let base = sharp(src).rotate();
  if (m.inset) {
    const b1 = await base.toBuffer();
    const { width: bw, height: bh } = await sharp(b1).metadata();
    const [t, r, b2, l] = m.inset;
    base = sharp(b1).extract({ left: Math.round(bw * l), top: Math.round(bh * t), width: Math.round(bw * (1 - l - r)), height: Math.round(bh * (1 - t - b2)) });
  }
  const game = await base.clone().resize({ width: GAME_MAX, height: GAME_MAX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
  fs.writeFileSync(files.game, game.data);
  fs.writeFileSync(files.thumb, thumb);
  return { width: game.info.width, height: game.info.height };
}

// ---- Art Institute of Chicago ----
for (const sel of selection) {
  const sid = sel.sid;
  const ex = existingAic.get(sid);
  const d = (await get(`https://api.artic.edu/api/v1/artworks/${sid}?fields=id,is_public_domain,image_id`, true)).data;
  if (d.is_public_domain !== true || !d.image_id) throw new Error(`REFUSED: AIC ${sid} is not public domain / has no image`);
  const artistRaw = sel.artist_title;
  const artist = ex?.artist ?? NAME_FIX[artistRaw] ?? artistRaw;
  const title = ex?.title ?? cleanTitle(sid, sel.title, sel.kind);
  const id = ex?.id ?? slug(`${lastName(artist)}-${title}`).slice(0, 56);
  const theme = themeOf(id, title, sel.subject_titles ?? [], sel.kind);
  
  const yearText = ex?.year ?? sel.date_display.replace(/, border added.*$/, '').replace(/^(\d{4})-(\d{2,4})$/, '$1–$2');
  const m = { id, imageSource: `https://www.artic.edu/iiif/2/${d.image_id}/full/1200,/0/default.jpg`, inset: sel.kind === 'print' ? [0.03, 0.025, 0.025, 0.02] : undefined };
  const { width, height } = await makeImages(m);
  const portrait = height > width * 1.2;
  out.push({
    id, title, artist, artistSort: `${lastName(artist)} ${slug(artist)}`, year: yearText, yearStart: sel.date_start, yearEnd: sel.date_end ?? sel.date_start,
    era: eraOf(sel.date_start), theme, medium: sel.medium_display ?? '',
    imageUrl: `/artworks/${id}.webp`, thumbnailUrl: `/artworks/${id}-thumb.webp`, width, height,
    museum: 'Art Institute of Chicago', sourceUrl: `https://www.artic.edu/artworks/${sid}`, ...AIC_LICENSE,
    sourceImageUrl: m.imageSource, verifiedAt: today,
    description: descriptions[id] ?? autoDescription({ theme, artist, date: yearText, medium: sel.medium_display, style: sel.style_title, origin: sel.place_of_origin }),
  });
  console.log('ok', id.padEnd(48), `${width}x${height}`);
}

// ---- The Metropolitan Museum of Art (verified earlier; the Met API throttles bulk access) ----
const MET_THEME = { 'hokusai-great-wave': J };
const MET_START = { 'vermeer-water-pitcher': 1662, 'van-gogh-wheat-field-cypresses': 1889, 'sargent-madame-x': 1883, 'rembrandt-aristotle-homer': 1653, 'hokusai-great-wave': 1830, 'degas-dance-class': 1874 };
for (const c of metCache) {
  if (!fs.existsSync(path.join(OUT_DIR, `${c.id}.webp`))) throw new Error(`missing image for cached Met work ${c.id}: run the earlier Met download first`);
  const { width, height } = await sharp(path.join(OUT_DIR, `${c.id}.webp`)).metadata();
  const theme = THEME_BY_ID[c.id] ?? MET_THEME[c.id];
  out.push({
    id: c.id, title: c.title, artist: c.artist, artistSort: `${lastName(c.artist)} ${slug(c.artist)}`, year: c.year, yearStart: MET_START[c.id], yearEnd: MET_START[c.id],
    era: eraOf(MET_START[c.id]), theme, medium: c.id === 'hokusai-great-wave' ? 'Woodblock print' : 'Oil on canvas',
    imageUrl: `/artworks/${c.id}.webp`, thumbnailUrl: `/artworks/${c.id}-thumb.webp`, width, height,
    museum: c.museum, sourceUrl: c.sourceUrl, license: c.license, licenseUrl: c.licenseUrl, licenseBasis: c.licenseBasis, sourceImageUrl: c.sourceImageUrl, verifiedAt: c.verifiedAt,
    description: descriptions[c.id],
  });
  console.log('ok (cached Met)', c.id);
}

const ts = `/* AUTO-GENERATED by scripts/fetch-artworks.mjs on ${today}. Do not edit by hand: re-run the scripts instead. */
import type { Artwork } from '../types';

export const ARTWORKS_VERSION = 'art2';

export const ARTWORKS: Artwork[] = ${JSON.stringify(out, null, 2)};
`;
fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });
fs.writeFileSync(OUT_TS, ts);
console.log(`wrote ${out.length} artworks to ${OUT_TS}`);

// The daily pool V2 is a FROZEN list: written once, never overwritten, so published days never change.
const POOL_TS = 'src/games/art-slide/data/daily-pools.ts';
if (!fs.existsSync(POOL_TS)) {
  fs.writeFileSync(POOL_TS, `/**
 * Frozen pool for the daily puzzle from 2026-11-14 on (see DAILY_POOL_V2_FROM). Never reorder or
 * remove entries. To add paintings to the daily rotation, create a new pool version.
 */
export const DAILY_POOL_V2: readonly string[] = ${JSON.stringify(out.map((a) => a.id), null, 2)};
`);
  console.log('wrote frozen daily pool V2');
}
