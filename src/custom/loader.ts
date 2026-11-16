import { getArtwork, registerArtwork, unregisterArtwork } from '../games/art-slide/data';
import type { Artwork } from '../games/art-slide/types';
import { deletePhoto, getAllPhotos, getPhoto, photoArtworkId, photoIdOf, type PhotoMeta } from './photos';

const urls = new Map<string, string[]>();

function toArtwork(id: string, name: string, width: number, height: number, main: string, thumb: string): Artwork {
  return {
    id,
    title: name,
    artist: '',
    artistSort: '',
    year: '',
    yearStart: 0,
    yearEnd: 0,
    era: '',
    theme: 'My Photos',
    medium: '',
    museum: '',
    imageUrl: main,
    thumbnailUrl: thumb,
    width,
    height,
    sourceUrl: '',
    license: 'Your own photo (stays on this device)',
    licenseUrl: '',
    licenseBasis: '',
    sourceImageUrl: '',
    verifiedAt: '',
    description: '',
  };
}

/** Makes one stored photo playable (registered like a painting, with temporary local addresses for its pictures). */
export async function loadCustomArtwork(artworkId: string): Promise<Artwork | null> {
  const known = getArtwork(artworkId);
  if (known) return known;
  const rec = await getPhoto(photoIdOf(artworkId));
  if (!rec) return null;
  const main = URL.createObjectURL(rec.blob);
  const thumb = URL.createObjectURL(rec.thumb);
  urls.set(artworkId, [main, thumb]);
  const art = toArtwork(artworkId, rec.name, rec.width, rec.height, main, thumb);
  registerArtwork(art);
  return art;
}

export function forgetCustomArtwork(artworkId: string): void {
  for (const u of urls.get(artworkId) ?? []) URL.revokeObjectURL(u);
  urls.delete(artworkId);
  unregisterArtwork(artworkId);
}

export async function removePhoto(photoId: string): Promise<void> {
  await deletePhoto(photoId);
  forgetCustomArtwork(photoArtworkId(photoId));
}

/** The saved photos with a temporary local address for each thumbnail (revoke with revokeThumbs when leaving the page). */
export async function listPhotoCards(): Promise<{ meta: PhotoMeta; thumbUrl: string }[]> {
  const all = await getAllPhotos();
  return all
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ blob: _main, thumb, ...meta }) => ({ meta, thumbUrl: URL.createObjectURL(thumb) }));
}
export const revokeThumbs = (cards: { thumbUrl: string }[]): void => cards.forEach((c) => URL.revokeObjectURL(c.thumbUrl));
