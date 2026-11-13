/**
 * Writes the link-preview images (og/<id>.jpg) and share pages (s/<id>/index.html) for every artwork.
 *   vite-node scripts/make-share-assets.ts              -> into dist/ (runs as the last step of `npm run build`)
 *   vite-node scripts/make-share-assets.ts --dir public -> into public/ for local testing (git-ignored)
 * The absolute site address comes from SITE_URL (or CF_PAGES_URL on Cloudflare Pages).
 */
import { writeShareAssets } from './share-assets-lib';

const argDir = process.argv.indexOf('--dir');
const outDir = argDir > 0 ? process.argv[argDir + 1] : 'dist';
const site = process.env.SITE_URL || process.env.CF_PAGES_URL || '';
if (!site) console.warn('SITE_URL is not set: og:image will be a relative path. Social networks need an absolute address; set SITE_URL for production.');
const n = await writeShareAssets(outDir, site);
console.log(`share assets: ${n} images + pages in ${outDir}/ (site: ${site || 'relative'})`);
