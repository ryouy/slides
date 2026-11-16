import { ARTWORKS as BASE_ARTWORKS } from './artworks';
import { NEW_ARTWORKS } from './additional-artworks';
import { DESCRIPTION_OVERRIDES } from './description-overrides';
import type { Artwork } from '../types';
import { isArtworkLocked } from '../../../premium/entitlement';

export { ARTWORKS_VERSION } from './artworks';
/** Base artworks retain their order. Colab additions appear in Gallery and random play. */
export const ARTWORKS: Artwork[] = [...BASE_ARTWORKS, ...NEW_ARTWORKS].map((artwork) => ({
  ...artwork,
  ...(DESCRIPTION_OVERRIDES[artwork.id] ?? {}),
}));

const byId = new Map(ARTWORKS.map((a) => [a.id, a]));
/** Artworks that exist only on this device (the visitor's own photos), added at run time. */
const extra = new Map<string, Artwork>();
export const registerArtwork = (a: Artwork): void => void extra.set(a.id, a);
export const unregisterArtwork = (id: string): void => void extra.delete(id);
export const getArtwork = (id: string): Artwork | undefined => byId.get(id) ?? extra.get(id);

/** The paintings a visitor may play right now (everything while the paid plan is not live). */
export const playableArtworks = (premium: boolean, gating?: boolean): Artwork[] => ARTWORKS.filter((a) => !isArtworkLocked(a.id, premium, gating));

/** The next playable artwork after `id` in list order (wraps around). */
export function nextArtwork(id: string, premium = true, gating?: boolean): Artwork {
  const i = ARTWORKS.findIndex((a) => a.id === id);
  for (let k = 1; k <= ARTWORKS.length; k++) {
    const a = ARTWORKS[(i + k) % ARTWORKS.length];
    if (!isArtworkLocked(a.id, premium, gating)) return a;
  }
  return ARTWORKS[(i + 1) % ARTWORKS.length];
}

/** A random playable painting, never the one in `exclude`. `rng` is injectable for tests. */
export function pickRandomArtwork(exclude?: string, rng: () => number = Math.random, premium = true, gating?: boolean): Artwork {
  const pool = playableArtworks(premium, gating).filter((a) => a.id !== exclude);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
