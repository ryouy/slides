/**
 * 忍者AdMax (Shinobi AdMax) 300x250 inline banners: one tag for PC, one for phones. A tag is a single
 * `<script src="https://adm.shinobi.jp/s/<id>">` that may use `document.write`, so every ad lives in its
 * own sandboxed <iframe> pointing at a small page of this site (see AdBanner and the `adFrames` Vite plugin).
 * VITE_ADS_ENABLED=false turns ads off for a build (nothing is requested). The dev server never loads real ads.
 */
export type AdUnitId = 'mobile' | 'desktop';

export interface AdUnit {
  id: AdUnitId;
  /** The 32-hex id in the tag issued by AdMax. */
  tag: string;
  width: number;
  height: number;
}

export const AD_UNITS: Record<AdUnitId, AdUnit> = {
  desktop: { id: 'desktop', tag: 'a1c2070f42cfa5a3fc12867425b874ed', width: 300, height: 250 },
  mobile: { id: 'mobile', tag: 'e17c874ec991654a2894f1c609f8c486', width: 300, height: 250 },
};

export const SCRIPT_BASE = 'https://adm.shinobi.jp/s';
export const adScriptUrl = (unit: AdUnit): string => `${SCRIPT_BASE}/${unit.tag}`;

/** Real ads are requested in production builds; VITE_ADS_ENABLED=false switches them off (e.g. for a preview deploy). */
export const adsEnabled = (): boolean => import.meta.env?.VITE_ADS_ENABLED !== 'false';

/** The PC tag from 728px of viewport width up (the site's desktop breakpoint), the phone tag below. */
export const DESKTOP_MIN_WIDTH = 728;
export const chooseAdUnit = (viewportWidth: number): AdUnit => (viewportWidth >= DESKTOP_MIN_WIDTH ? AD_UNITS.desktop : AD_UNITS.mobile);

/** Narrower screens than the 300px unit get no ad at all (nothing is shrunk or cropped). */
export const AD_MIN_WIDTH = 300;
export const adFits = (viewportWidth: number): boolean => viewportWidth >= AD_MIN_WIDTH;

const TAG = /^[0-9a-f]{32}$/;

/** Where the frame page of a unit lives on our own domain (served by the dev server, emitted at build). */
export const adFrameUrl = (unit: AdUnit) => `/ads/${unit.id}.html`;

/** The page that runs in the ad's own iframe: exactly one AdMax script, nothing else. */
export function adFrameHtml(unit: AdUnit): string {
  if (!TAG.test(unit.tag)) throw new Error('invalid ad tag');
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="robots" content="noindex"><title>Advertisement</title>' +
    '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>' +
    `<!-- admax --><script src="${adScriptUrl(unit)}"></script><!-- admax -->` +
    '</body></html>'
  );
}
