import type { Artwork } from '../types';

/** Title, credit line (museum, licence, source link) and the original short description. */
export function ArtworkInfo({ artwork }: { artwork: Artwork }) {
  return (
    <section className="art-info" aria-label="Artwork">
      <h2>ARTWORK</h2>
      <p className="art-title" data-testid="art-title">{artwork.title}</p>
      <p className="art-meta">{artwork.artist} · {artwork.year}</p>
      <p className="art-desc">{artwork.description}</p>
      <p className="art-credit">
        {artwork.museum} · <a href={artwork.licenseUrl} target="_blank" rel="noopener noreferrer">{artwork.license}</a> ·{' '}
        <a href={artwork.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>
      </p>
    </section>
  );
}
