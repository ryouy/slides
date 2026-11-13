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
