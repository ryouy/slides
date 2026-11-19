/**
 * Common data for the SwiftUI app (run by `npm run ios:data`, together with the other ios/scripts/export-*.ts files).
 * Writes into ios/App/App/public/ (bundled into the app, git-ignored, regenerated at will):
 *   data/strings.json         UI text of all 7 languages (same dictionaries as the web)
 *   data/artworks.json        metadata of every registered painting + free ids + the iOS daily pools
 *   artworks/<id>-thumb.webp  every thumbnail;  artworks/<id>.webp  FREE paintings only
 *   artworks/manifest.json    size + sha256 of every full-size image (verifies Premium downloads)
 * Fails (exit 1) on a missing file or a Premium full-size image in the bundle. Also writes golden RNG vectors for the Swift tests.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { ARTWORKS } from '../../src/games/art-slide/data';
import { FREE_ARTWORK_IDS } from '../../src/premium/freeList';
import { IOS_DAILY_POOLS, dailyArtworkIdIos } from '../../src/games/art-slide/logic/dailyPickIos';
import { hashSeed, rngFromString, shuffled } from '../../src/utils/rng';
import { dailyNumber, jstDateKey } from '../../src/utils/date';
import de from '../../src/i18n/de';
import en from '../../src/i18n/en';
import es from '../../src/i18n/es';
import fr from '../../src/i18n/fr';
import ja from '../../src/i18n/ja';
import ko from '../../src/i18n/ko';
import zh from '../../src/i18n/zh';

const fail = (m: string): never => { console.error(`export-data: ${m}`); process.exit(1); };
const PUB = 'ios/App/App/public';
const ART = `${PUB}/artworks`;
// the folder is generated: drop anything that is not ours (e.g. files left by the old WebView build) so it can never ship in the app
if (existsSync(PUB)) for (const f of readdirSync(PUB)) if (!['artworks', 'data'].includes(f)) rmSync(`${PUB}/${f}`, { recursive: true, force: true });
rmSync(ART, { recursive: true, force: true });
mkdirSync(`${PUB}/data`, { recursive: true });
mkdirSync(ART, { recursive: true });

// iOS-only texts (ios/scripts/ios-strings*.json: English + Japanese; other languages fall back to English) are merged into the web dictionaries
const all: Record<string, Record<string, string>> = { en, ja, zh, ko, es, fr, de };
for (const f of readdirSync('ios/scripts').filter((n) => /^ios-strings.*\.json$/.test(n)).sort()) { // ios-strings.json + one file per game (ios-strings-word.json …)
  const part = JSON.parse(readFileSync(`ios/scripts/${f}`, 'utf8')) as Record<string, Record<string, string>>;
  for (const [l, d] of Object.entries(part)) all[l] = { ...all[l], ...d };
}
writeFileSync(`${PUB}/data/strings.json`, JSON.stringify(all));

const free = new Set(FREE_ARTWORK_IDS);
for (const id of free) if (!ARTWORKS.some((a) => a.id === id)) fail(`free id ${id} is not a registered artwork`);
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
const manifest: Record<string, { bytes: number; sha256: string }> = {};
let freeBytes = 0, thumbBytes = 0;
for (const a of ARTWORKS) {
  const full = `public/artworks/${a.id}.webp`, thumb = `public/artworks/${a.id}-thumb.webp`;
  if (!existsSync(thumb)) fail(`${a.id}: thumbnail missing`);
  if (!existsSync(full)) fail(`${a.id}: full-size image missing`);
  copyFileSync(thumb, `${ART}/${a.id}-thumb.webp`);
  thumbBytes += statSync(thumb).size;
  manifest[a.id] = { bytes: statSync(full).size, sha256: sha(full) };
  if (free.has(a.id)) { copyFileSync(full, `${ART}/${a.id}.webp`); freeBytes += statSync(full).size; }
}
writeFileSync(`${ART}/manifest.json`, JSON.stringify(manifest));
writeFileSync(`${PUB}/data/artworks.json`, JSON.stringify({ free: FREE_ARTWORK_IDS, dailyPools: IOS_DAILY_POOLS, artworks: ARTWORKS }));

const files = readdirSync(ART);
const fulls = files.filter((f) => f.endsWith('.webp') && !f.endsWith('-thumb.webp')).map((f) => f.slice(0, -5));
for (const id of fulls) if (!free.has(id)) fail(`Premium full-size image in bundle: ${id}`);
if (fulls.length !== free.size) fail(`expected ${free.size} full-size images, found ${fulls.length}`);

// golden vectors for the Swift tests
const seeds = ['', 'a', 'daily|2026-11-18', 'art-daily|ios1|2026-11-01|cycle0', '日本語🎨', 'x'.repeat(200)];
const today = jstDateKey();
mkdirSync('ios/SlideKit/Tests/SlideCoreTests/Golden', { recursive: true });
writeFileSync('ios/SlideKit/Tests/SlideCoreTests/Golden/rng.json', JSON.stringify({
  hash: seeds.map((s) => ({ seed: s, hash: hashSeed(s) })),
  floats: seeds.map((s) => { const r = rngFromString(s); return { seed: s, values: Array.from({ length: 8 }, () => r()) }; }),
  shuffles: seeds.map((s) => ({ seed: s, out: shuffled(rngFromString(s), Array.from({ length: 12 }, (_, i) => i)) })),
  dailyNumbers: ['2026-11-01', '2026-12-31', '2027-03-01'].map((d) => ({ date: d, n: dailyNumber(d) })),
  iosDaily: ['2026-11-18', '2026-12-25', '2027-01-01'].map((d) => ({ date: d, id: dailyArtworkIdIos(d) })),
  today,
}));
const mb = (n: number) => (n / 1048576).toFixed(1);
console.log(`export-data: ${ARTWORKS.length} artworks; ${fulls.length} full-size (free, ${mb(freeBytes)} MB), ${ARTWORKS.length} thumbnails (${mb(thumbBytes)} MB); no Premium image bundled`);
