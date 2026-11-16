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

export { FREE_ARTWORK_IDS, isFreeArtwork } from './freeList';
import { isFreeArtwork } from './freeList';

/** Free plays up to board level 5; Premium also gets levels 6 and 7 (the largest the game has). */
export const FREE_MAX_LEVEL = 5;

/** Is the paid plan live in this build? */
export function gatingOn(): boolean {
  if (import.meta.env?.VITE_PREMIUM_ENABLED === 'true') return true;
  try {
    return !!import.meta.env?.DEV && localStorage.getItem('slides:dev-gating') === '1';
  } catch {
    return false;
  }
}

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
/** Set by the account layer once a visitor has signed in on this device: the plan is then looked up before anything is judged. */
export const SIGNED_IN_HINT = 'slides:signed-in';
function hasHint(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === '1';
  } catch {
    return false;
  }
}
// decided before the first render: a returning signed-in visitor starts in "loading" (no ads, no lock decisions yet)
let current: Entitlement = devPremium() ? { premium: true, loading: false } : { premium: false, loading: gatingOn() && hasHint() };
const listeners = new Set<() => void>();

/** Dev server only (tests): act as Premium. Always false in a production build. */
export function devPremium(): boolean {
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
