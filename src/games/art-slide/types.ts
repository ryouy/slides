export interface Artwork {
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Game image (kept at its original aspect ratio). */
  imageUrl: string;
  thumbnailUrl: string;
  /** Size of the game image in pixels. */
  width: number;
  height: number;
  /** Where the square board crop is centred, 0..1 (default centre). */
  focus: { x: number; y: number };
  museum: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  /** Why this work may be used (the API field that was checked). */
  licenseBasis: string;
  /** The exact URL the image was downloaded from. */
  sourceImageUrl: string;
  /** Date the public-domain flag was verified against the museum API. */
  verifiedAt: string;
  /** Original short description written for this site. */
  description: string;
}
