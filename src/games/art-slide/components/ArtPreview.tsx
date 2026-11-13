import { useEffect, useRef, useState } from 'react';
import type { Artwork } from '../types';

/** How long the closing animation runs before the preview is removed. */
export const PREVIEW_CLOSE_MS = 260;
const GROW = 1.07;

interface Props {
  artwork: Artwork;
  /** Where the puzzle board is on screen; the painting appears right on top of it, a little larger. */
  rect: { left: number; top: number; width: number; height: number };
  label: string;
  onClosed: () => void;
}

/**
 * The finished painting laid over the actual puzzle. Tapping anywhere (or Escape) closes it with a
 * smooth fade instead of vanishing; the title and credit are tiny and sit inside the picture.
 */
export function ArtPreview({ artwork, rect, label, onClosed }: Props) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);

  const close = () => {
    if (timer.current !== null) return;
    setClosing(true);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    timer.current = window.setTimeout(onClosed, reduced ? 0 : PREVIEW_CLOSE_MS);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('keydown', h);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // a little larger than the board, but always fully on screen
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const s = Math.max(0.5, Math.min(GROW, (vw - 8) / rect.width, (vh - 8) / rect.height));
  const w = rect.width * s;
  const h = rect.height * s;
  const left = rect.left + rect.width / 2 - w / 2;
  const top = rect.top + rect.height / 2 - h / 2;

  return (
    <div className={`preview-layer${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={label} data-testid="preview-layer" data-state={closing ? 'closing' : 'open'} onClick={close}>
      <figure className="preview-card" data-testid="preview-card" style={{ left, top, width: w, height: h }}>
        <img src={artwork.imageUrl} alt={`${artwork.title} – ${artwork.artist}`} width={artwork.width} height={artwork.height} draggable={false} />
        <figcaption>
          <span className="pv-title">{artwork.title} <i>{artwork.artist}, {artwork.year}</i></span>
          <span className="pv-credit">{artwork.museum} · CC0</span>
        </figcaption>
      </figure>
    </div>
  );
}
