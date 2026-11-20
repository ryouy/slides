// Every UI text the Swift code asks for by a literal key (app.t("key") / t("key")) must exist in the generated ios/App/App/public/data/strings.json.
// A missing one shows its raw key on screen (the app was once built with data generated before a new key was added). Run after `npm run ios:data`:
//   npm run ios:check-strings
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dataFile = 'ios/App/App/public/data/strings.json';
let all;
try { all = JSON.parse(readFileSync(dataFile, 'utf8')); } catch { console.log(`${dataFile} not found: run \`npm run ios:data\` first`); process.exit(2); }
const langs = Object.keys(all);
const en = all.en ?? all[langs[0]];

function* swiftFiles(d) {
  for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) yield* swiftFiles(p); else if (p.endsWith('.swift')) yield p; }
}
const used = new Map();
for (const f of swiftFiles('ios/SlideKit/Sources/SlideKit')) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\b(?:app\.)?t\("([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)"/g)) if (!used.has(m[1])) used.set(m[1], f);
}
const missing = [...used].filter(([k]) => !(k in en));
for (const [k, f] of missing) console.log(`MISSING  ${k}   (${f})`);
console.log(missing.length ? `\n${missing.length} text key(s) missing: run \`npm run ios:data\` (or add them to ios/scripts/ios-strings*.json)` : `all ${used.size} text keys used by the Swift code exist (${langs.length} languages)`);
process.exit(missing.length ? 1 : 0);
