import { ARTWORKS } from './artworks';
import type { Artwork } from '../types';

export { ARTWORKS, ARTWORKS_VERSION } from './artworks';

const byId = new Map(ARTWORKS.map((a) => [a.id, a]));
export const getArtwork = (id: string): Artwork | undefined => byId.get(id);

/** The artwork after `id` in list order (wraps around). */
export function nextArtwork(id: string): Artwork {
  const i = ARTWORKS.findIndex((a) => a.id === id);
  return ARTWORKS[(i + 1) % ARTWORKS.length];
}

/** A random painting, never the one in `exclude`. `rng` is injectable for tests. */
export function pickRandomArtwork(exclude?: string, rng: () => number = Math.random): Artwork {
  const pool = ARTWORKS.filter((a) => a.id !== exclude);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
