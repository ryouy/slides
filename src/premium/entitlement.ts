import { useSyncExternalStore } from 'react';

/**
 * Free / Premium rules for ART SLIDE (one place for every check).
 *
 * Gating is off until the paid plan is actually live: a build without VITE_PREMIUM_ENABLED=true behaves
 * exactly like before (every painting and size open, no lock icons, no Premium links). The dev server can
 * switch gating on for tests with localStorage 'slides:dev-gating' = '1'; production ignores that.
 *
 * The browser only *displays* these rules: images and game code are static files, so a determined visitor
 * can still reach a locked painting. Real content protection would need Premium images served by the Worker.
 */

/** 30 fixed paintings for Free: spread over every theme and era, at most one per artist except where a theme is small. */
export const FREE_ARTWORK_IDS: readonly string[] = [
  'bierstadt-mountain-brook', // Albert Bierstadt · Landscape · 1850–1879
  'chase-wind-swept-sands', // William Merritt Chase · Landscape · 1880–1899
  'cole-distant-view-of-niagara-falls', // Thomas Cole · Landscape · 1800–1849
  'lorrain-view-of-delphi-with-a-procession', // Claude Lorrain · Landscape · Before 1700
  'cezanne-auvers-panoramic-view', // Paul Cézanne · Landscape · 1850–1879
  'constable-stoke-by-nayland', // John Constable · Landscape · 1800–1849
  'guardi-the-grand-canal-venice', // Francesco Guardi · Sea & Water · 1700s
  'monet-water-lilies', // Claude Monet · Sea & Water · 1900s
  'gogh-fishing-in-spring-the-pont-de-clichy-asnieres', // Vincent van Gogh · Sea & Water · 1880–1899
  'sorolla-rocks-at-the-lighthouse-biarritz', // Joaquín Sorolla · Sea & Water · 1900s
  'vermeer-water-pitcher', // Johannes Vermeer · People & Daily Life · Before 1700
  'cassatt-childs-bath', // Mary Cassatt · People & Daily Life · 1880–1899
  'degas-dance-class', // Edgar Degas · People & Daily Life · 1850–1879
  'sargent-the-fountain-villa-torlonia-frascati-italy', // John Singer Sargent · People & Daily Life · 1900s
  'van-gogh-bedroom', // Vincent van Gogh · People & Daily Life · 1880–1899
  'copley-daniel-hubbard', // John Singleton Copley · Portrait · 1700s
  'sargent-madame-x', // John Singer Sargent · Portrait · 1880–1899
  'hals-portrait-of-a-lady', // Frans Hals · Portrait · Before 1700
  'ingres-amedee-david-the-comte-de-pastoret', // Jean-Auguste-Dominique Ingres · Portrait · 1800–1849
  'corot-interrupted-reading', // Camille Corot · Portrait · 1850–1879
  'bellotto-view-of-pirna-with-the-fortress-of-sonnenstein', // Bernardo Bellotto · City & Street · 1700s
  'hassam-new-york-street', // Childe Hassam · City & Street · 1900s
  'caillebotte-paris-street', // Gustave Caillebotte · City & Street · 1850–1879
  'fantin-latour-roses-in-a-bowl', // Henri Fantin-Latour · Still Life & Flowers · 1880–1899
  'redon-still-life-with-flowers', // Odilon Redon · Still Life & Flowers · 1900s
  'harnett-just-dessert', // William Michael Harnett · Still Life & Flowers · 1880–1899
  'poussin-landscape-with-saint-john-on-patmos', // Nicolas Poussin · Myth & Religion · Before 1700
  'hiroshige-arai', // Utagawa Hiroshige · Japanese Prints · 1800–1849
  'hokusai-great-wave', // Katsushika Hokusai · Japanese Prints · 1800–1849
  'hokusai-shower-below-the-summit', // Katsushika Hokusai · Japanese Prints · 1800–1849
];
const FREE = new Set(FREE_ARTWORK_IDS);

/** Free plays up to the 6th board level (about 6×6 pieces); Premium gets the larger ones. */
export const FREE_MAX_LEVEL = 6;

/** Is the paid plan live in this build? */
export function gatingOn(): boolean {
  if (import.meta.env?.VITE_PREMIUM_ENABLED === 'true') return true;
  try {
    return !!import.meta.env?.DEV && localStorage.getItem('slides:dev-gating') === '1';
  } catch {
    return false;
  }
}

export const isFreeArtwork = (id: string): boolean => FREE.has(id);
/** User photos ("custom:<id>") are Premium-only. */
export const isCustomArtwork = (id: string): boolean => id.startsWith('custom:');

export const isArtworkLocked = (id: string, premium: boolean, gating: boolean = gatingOn()): boolean =>
  gating && !premium && !isFreeArtwork(id);
export const isLevelLocked = (level: number, premium: boolean, gating: boolean = gatingOn()): boolean =>
  gating && !premium && level > FREE_MAX_LEVEL;

// ---- the visitor's current plan (filled in by the account layer; Free until it says otherwise) ----
export interface Entitlement {
  /** Premium is active for the signed-in account (decided by the server). */
  premium: boolean;
  /** True while the plan is still being looked up for a returning signed-in visitor (no ads, no lock flicker). */
  loading: boolean;
}
let current: Entitlement = devPremium() ? { premium: true, loading: false } : { premium: false, loading: false };
const listeners = new Set<() => void>();

function devPremium(): boolean {
  try {
    return !!import.meta.env?.DEV && localStorage.getItem('slides:dev-premium') === '1';
  } catch {
    return false;
  }
}

export function setEntitlement(e: Entitlement): void {
  if (e.premium === current.premium && e.loading === current.loading) return;
  current = e;
  listeners.forEach((l) => l());
}
export const getEntitlement = (): Entitlement => current;
export function useEntitlement(): Entitlement & { gating: boolean } {
  const e = useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), getEntitlement);
  return { ...e, gating: gatingOn() };
}
