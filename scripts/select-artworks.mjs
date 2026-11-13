/**
 * Selects public-domain paintings (and a few Japanese woodblock prints) from the Art Institute of
 * Chicago open-access API and writes scripts/selection.json. Run rarely; the output is committed so
 * the artwork set stays stable. Then run scripts/fetch-artworks.mjs to download the images.
 *   node scripts/select-artworks.mjs
 *
 * Only objects with is_public_domain = true and an image are considered. Works attributed to a
 * "workshop/follower/after/style of" are skipped, as are subjects that are unsuitable for an
 * all-ages game site (nudes, bathers, violence, crucifixion).
 */
import fs from 'node:fs';

const FIELDS = ['id', 'title', 'artist_title', 'date_start', 'date_end', 'date_display', 'medium_display', 'place_of_origin', 'style_title', 'subject_titles', 'classification_title', 'is_on_view', 'thumbnail', 'boost_rank', 'image_id', 'is_public_domain'];
// [artist, max works]
const ARTISTS = [
  ['Claude Monet', 5], ['Vincent van Gogh', 5], ['Pierre-Auguste Renoir', 3], ['Edgar Degas', 3], ['Mary Cassatt', 3], ['Georges Seurat', 1], ['Gustave Caillebotte', 1],
  ['Henri de Toulouse-Lautrec', 3], ['Paul Gauguin', 2], ['Paul Cezanne', 3], ['Camille Pissarro', 2], ['Alfred Sisley', 2], ['Berthe Morisot', 2], ['Edouard Manet', 2],
  ['James McNeill Whistler', 2], ['John Singer Sargent', 3], ['Winslow Homer', 2], ['Thomas Eakins', 1], ['Henri Rousseau', 1], ['Jean-Baptiste-Camille Corot', 2],
  ['Gustave Courbet', 2], ['Jean-Francois Millet', 2], ['John Constable', 1], ['El Greco', 1], ['Rembrandt van Rijn', 1], ['Peter Paul Rubens', 1], ['Frans Hals', 1],
  ['Jacob van Ruisdael', 1], ['Thomas Cole', 2], ['Frederic Edwin Church', 1], ['Albert Bierstadt', 1], ['George Inness', 2], ['Childe Hassam', 3], ['William Merritt Chase', 2],
  ['Edvard Munch', 1], ['Paul Signac', 1], ['Giovanni Battista Tiepolo', 1], ['Thomas Gainsborough', 1], ['Henri Fantin-Latour', 2], ['Odilon Redon', 2],
  ['Claude Lorrain', 1], ['Honore Daumier', 1], ['Jean-Auguste-Dominique Ingres', 1], ['Jacques-Louis David', 1], ['Jean-Baptiste-Simeon Chardin', 1], ['Nicolas Poussin', 1],
  ['Giovanni Paolo Panini', 1], ['Bartolome Esteban Murillo', 1], ['Joaquin Sorolla', 1], ['Anders Zorn', 1], ['Max Liebermann', 1], ['Lovis Corinth', 1], ['Ferdinand Hodler', 1],
  ['Robert Henri', 1], ['George Bellows', 1], ['John Sloan', 1], ['Martin Johnson Heade', 1], ['William Michael Harnett', 1], ['John Singleton Copley', 1], ['Gilbert Stuart', 1],
  ['Jean-Leon Gerome', 1], ['Charles-Francois Daubigny', 1], ['Theodore Rousseau', 1], ['Eugene Boudin', 2], ['Johan Barthold Jongkind', 1], ['Gustave Moreau', 1],
  ['Joseph Mallord William Turner', 1], ['Francesco Guardi', 1], ['Bernardo Bellotto', 1], ['Jean-Honore Fragonard', 1], ['Francois Boucher', 1], ['Thomas Eakins', 1],
];
const PRINTS = [['Katsushika Hokusai', 2], ['Utagawa Hiroshige', 3]];

// Editorial choices after reviewing the search results: duplicates and lesser-known portraits are dropped,
// and two works that were already in the first release are pinned.
const DROP_IDS = new Set([89503, 24645, 77333, 28860, 663, 27962, 13742, 69619, 59787, 31285, 39652, 4371, 87088, 79349, 16146, 16496, 11312, 96559, 68792, 107862, 87467]);
const PIN_IDS = [27992, 28560, 80607, 16568, 14624, 20684, 14655, 111442, 61128, 27943, 111436, 87008]; // the works of the first release

const BAD_TITLE = /bather|bathing|nude|nymph|venus|odalisque|beheading|crucifix|massacre|execution|killing|slaughter|bullfight|lion hunt|martyr|mocked|rape|death of|dead |hunt\b|battle|combat/i;
const BAD_SUBJECT = /\bnudes?\b|violence|crucifixion|death|weapons|bathers|nudity|erotic|propaganda/i;
const BAD_ATTR = /workshop|follower|after |style of|circle of|attributed|copy|manner of/i;

async function search(must, limit) {
  const body = { query: { bool: { must } }, fields: FIELDS, limit, sort: [{ is_on_view: 'desc' }, '_score'] };
  // be polite to the API: pace requests and back off when rate limited (HTTP 429)
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((res) => setTimeout(res, 500 + attempt * 2500));
    const r = await fetch('https://api.artic.edu/api/v1/artworks/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'AIC-User-Agent': 'slide-games-build-script' }, body: JSON.stringify(body) });
    if (r.status === 429) continue;
    if (!r.ok) throw new Error(`search failed ${r.status}`);
    return (await r.json()).data ?? [];
  }
  throw new Error('search failed: rate limited');
}

function ok(d, artist) {
  if (!d.is_public_domain || !d.image_id || !d.thumbnail) return false;
  const { width: w, height: h } = d.thumbnail;
  if (Math.min(w, h) < 1400 || w / h < 0.6 || w / h > 1.9) return false;
  if (BAD_TITLE.test(d.title) || BAD_SUBJECT.test((d.subject_titles ?? []).join(' '))) return false;
  const a = d.artist_title ?? '';
  if (BAD_ATTR.test(a)) return false;
  const last = artist.split(' ').slice(-1)[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return a.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(last);
}

const picked = [];
const seen = new Set(DROP_IDS);
const take = (rows, artist, max, kind) => {
  let n = 0;
  for (const d of rows) {
    if (n >= max || seen.has(d.id) || !ok(d, artist)) continue;
    seen.add(d.id);
    picked.push({ sid: d.id, kind, ...d });
    n++;
  }
  return n;
};

for (const [artist, max] of ARTISTS) {
  const rows = await search([{ term: { is_public_domain: true } }, { term: { artwork_type_id: 1 } }, { exists: { field: 'image_id' } }, { match_phrase: { artist_title: artist } }], 16);
  const n = take(rows, artist, max, 'painting');
  console.log(String(n).padStart(2), artist);
}
for (const [artist, max] of PRINTS) {
  const rows = await search([{ term: { is_public_domain: true } }, { exists: { field: 'image_id' } }, { match_phrase: { artist_title: artist } }, { match_phrase: { classification_title: 'woodblock print' } }], 16);
  const n = take(rows, artist, max, 'print');
  console.log(String(n).padStart(2), artist, '(prints)');
}
for (const id of PIN_IDS) {
  const rows = await search([{ term: { id } }, { term: { is_public_domain: true } }], 1);
  if (rows[0] && !picked.some((x) => x.sid === id)) {
    seen.add(id);
    picked.push({ sid: id, kind: 'painting', ...rows[0] });
  }
}
fs.writeFileSync('scripts/selection.json', JSON.stringify(picked.map(({ sid, kind, title, artist_title, date_start, date_end, date_display, medium_display, place_of_origin, style_title, subject_titles, classification_title }) => ({ sid, kind, title, artist_title, date_start, date_end, date_display, medium_display, place_of_origin, style_title, subject_titles, classification_title })), null, 1));
console.log('selected', picked.length);
