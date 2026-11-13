/**
 * Adsterra banner units. Each unit is an "iframe" banner whose code is two scripts: one sets the global
 * `atOptions`, the next loads the ad. Both units use the same global name, so they must never run in
 * the same window: every ad lives in its own sandboxed <iframe srcdoc> (see AdBanner).
 *
 * The script host comes from the code Adsterra showed in the dashboard (confirmed as the official
 * domain). It can be changed without a code edit with VITE_ADSTERRA_SCRIPT_BASE; VITE_ADS_ENABLED=false
 * turns ads off for a build. The dev server never loads real ads.
 */
export type AdUnitId = 'mobile' | 'desktop';

export interface AdUnit {
  id: AdUnitId;
  key: string;
  width: number;
  height: number;
}

export const AD_UNITS: Record<AdUnitId, AdUnit> = {
  mobile: { id: 'mobile', key: '7ce68b5c8c3484d811e70436814e1b1c', width: 300, height: 250 },
  desktop: { id: 'desktop', key: 'd1f4ebc3ac6f4fa67d18ad875ecc8e1f', width: 728, height: 90 },
};

export const DEFAULT_SCRIPT_BASE = 'https://bauval.org/22';
export const scriptBase = (): string => ((import.meta.env.VITE_ADSTERRA_SCRIPT_BASE as string | undefined) || DEFAULT_SCRIPT_BASE).replace(/\/+$/, '');

/** Real ads are requested in production builds; VITE_ADS_ENABLED=false switches them off (e.g. for a preview deploy). */
export const adsEnabled = (): boolean => import.meta.env.VITE_ADS_ENABLED !== 'false';

/** 728x90 from 728px of viewport width up, 300x250 below. */
export const DESKTOP_MIN_WIDTH = 728;
export const chooseAdUnit = (viewportWidth: number): AdUnit => (viewportWidth >= DESKTOP_MIN_WIDTH ? AD_UNITS.desktop : AD_UNITS.mobile);

/**
 * Shrinks a unit that is wider than the screen (very narrow phones) so it never overflows. The 300px
 * unit keeps a 16px page margin; the 728px unit is only chosen from 728px up, where it simply fits.
 */
export function adScale(unit: AdUnit, viewportWidth: number, gutter = unit.id === 'desktop' ? 0 : 16): number {
  const room = viewportWidth - gutter;
  return room >= unit.width ? 1 : Math.max(0.3, Math.round((room / unit.width) * 1000) / 1000);
}

const KEY = /^[0-9a-f]{32}$/;

/** The page that runs in the ad's own iframe: its own `atOptions`, one invoke script, nothing else. */
export function adSrcDoc(unit: AdUnit, base: string = scriptBase()): string {
  if (!KEY.test(unit.key)) throw new Error('invalid ad key');
  const src = `${base}/${unit.key}`;
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>' +
    `<script>atOptions={'key':'${unit.key}','format':'iframe','height':${unit.height},'width':${unit.width},'params':{}};</script>` +
    `<script src="${src}"></script>` +
    '</body></html>'
  );
}
