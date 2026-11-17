#!/usr/bin/env node
/**
 * Sets the effective date (制定日) of the Terms of Use / Privacy Policy in src/legal/operator.ts.
 * It is the day the texts are really published, so run it on the publication day, just before pushing:
 *
 *   npm run legal:date                 # today's date in Japan (JST)
 *   npm run legal:date -- 2026-12-01   # a given date
 *
 * Prints the date it wrote. Nothing else in the file is touched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = new URL('../src/legal/operator.ts', import.meta.url);

/** Today's date in Japan as YYYY-MM-DD. */
export const jstToday = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);

export const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;

/** Returns the source with `effectiveDate` set to `date` (throws if the line is not found exactly once). */
export function withEffectiveDate(source, date) {
  if (!validDate(date)) throw new Error(`not a valid date: ${date}`);
  const re = /(\n  effectiveDate: )'[^']*'(,)/g;
  const hits = source.match(re) ?? [];
  if (hits.length !== 1) throw new Error(`expected exactly one effectiveDate in OPERATOR, found ${hits.length}`);
  return source.replace(re, `$1'${date}'$2`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const date = process.argv[2] ?? jstToday();
  try {
    writeFileSync(FILE, withEffectiveDate(readFileSync(FILE, 'utf8'), date));
    console.log(`effectiveDate set to ${date} in src/legal/operator.ts`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
