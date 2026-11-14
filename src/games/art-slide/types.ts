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
  /** Sort key for the artist: last name first (lower-case, no accents). */
  artistSort: string;
  /** Start / end year (for sorting and the era group). */
  yearStart: number;
  yearEnd: number;
  /** Gallery groups. */
  era: string;
  theme: string;
  medium: string;
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
  /** Full museum text (if licensed) or a description derived from official metadata. */
  description: string;
  descriptionKind?: 'museum_text' | 'metadata_summary';
  /** Museum-authored text is not necessarily under the image's CC0 license. */
  descriptionAttribution?: string;
  descriptionSourceUrl?: string;
  descriptionLicense?: string;
  descriptionLicenseUrl?: string;
  descriptionModifications?: string;
}
