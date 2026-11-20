// Checks every PrivacyInfo.xcprivacy under the given folders/files against Apple's validation rules (TN3181), so ITMS-91064 cannot
// reach App Store Connect again. Needs macOS (plutil). Usage:
//   node ios/scripts/check-privacy-manifests.mjs [path ...]    (default: the app's own manifest in the source tree)
//   node ios/scripts/check-privacy-manifests.mjs "<Name>.xcarchive/Products/Applications/App.app"   (the real upload candidate)
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const targets = process.argv.slice(2);
if (targets.length === 0) targets.push('ios/App/App/PrivacyInfo.xcprivacy');

function* manifests(p) {
  const st = statSync(p);
  if (st.isFile()) { yield p; return; }
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name);
    if (e.isDirectory()) yield* manifests(f);
    else if (e.name === 'PrivacyInfo.xcprivacy') yield f;
  }
}

const isDomain = (d) => typeof d === 'string' && d.length > 0 && !/[\/?#:\s]/.test(d) && !d.endsWith('.') && d.includes('.');
let files = 0, errors = 0;
for (const t of targets) for (const f of manifests(t)) {
  files++;
  let m;
  try { m = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', f], { encoding: 'utf8' })); }
  catch (e) { console.log(`ERROR ${f}\n  not a valid property list`); errors++; continue; }
  const bad = [];
  const hasTracking = 'NSPrivacyTracking' in m, hasDomains = 'NSPrivacyTrackingDomains' in m;
  if (hasTracking && typeof m.NSPrivacyTracking !== 'boolean') bad.push('NSPrivacyTracking must be a Boolean');
  if (hasDomains && !(Array.isArray(m.NSPrivacyTrackingDomains) && m.NSPrivacyTrackingDomains.every((d) => typeof d === 'string'))) bad.push('NSPrivacyTrackingDomains must be an array of strings');
  const tracking = m.NSPrivacyTracking === true;
  const domains = Array.isArray(m.NSPrivacyTrackingDomains) ? m.NSPrivacyTrackingDomains : [];
  if (tracking && domains.length === 0) bad.push('NSPrivacyTracking is true but NSPrivacyTrackingDomains is empty or missing (ITMS-91064): list the tracking domains, or set NSPrivacyTracking to false and remove NSPrivacyTrackingDomains');
  if (!tracking && hasDomains && domains.length > 0) bad.push('NSPrivacyTracking is not true but NSPrivacyTrackingDomains has entries (ITMS-91064): remove NSPrivacyTrackingDomains');
  for (const d of domains) if (!isDomain(d)) bad.push(`tracking domain "${d}" is malformed (no scheme, path, port or trailing dot)`);
  for (const [i, c] of (m.NSPrivacyCollectedDataTypes ?? []).entries()) {
    if (typeof c.NSPrivacyCollectedDataType !== 'string') bad.push(`collected data type #${i} has no type`);
    if (typeof c.NSPrivacyCollectedDataTypeLinked !== 'boolean') bad.push(`collected data type #${i} needs a Boolean Linked`);
    if (typeof c.NSPrivacyCollectedDataTypeTracking !== 'boolean') bad.push(`collected data type #${i} needs a Boolean Tracking`);
    if (!Array.isArray(c.NSPrivacyCollectedDataTypePurposes)) bad.push(`collected data type #${i} needs a Purposes array`);
  }
  for (const [i, a] of (m.NSPrivacyAccessedAPITypes ?? []).entries()) {
    if (typeof a.NSPrivacyAccessedAPIType !== 'string' || !Array.isArray(a.NSPrivacyAccessedAPITypeReasons) || a.NSPrivacyAccessedAPITypeReasons.length === 0) bad.push(`accessed API #${i} needs a type and at least one reason`);
  }
  const summary = `tracking=${hasTracking ? m.NSPrivacyTracking : '(absent)'} domains=${hasDomains ? domains.length : '(absent)'}`;
  if (bad.length) { errors += bad.length; console.log(`ERROR ${f}  [${summary}]`); bad.forEach((b) => console.log(`  - ${b}`)); }
  else console.log(`ok    ${f}  [${summary}]`);
}
if (files === 0) { console.log('no PrivacyInfo.xcprivacy found'); process.exit(2); }
console.log(errors ? `\n${errors} problem(s) in ${files} manifest(s)` : `\nall ${files} manifest(s) valid`);
process.exit(errors ? 1 : 0);
