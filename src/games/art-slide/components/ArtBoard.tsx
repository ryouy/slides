import { useRef } from 'react';
import type { ArtBoard as Board, ArtDirection, Dims } from '../logic/board';
import { tileBackground } from '../logic/tiles';
import type { Artwork } from '../types';

interface Props {
  board: Board;
  dims: Dims;
  artwork: Artwork;
  showNumbers: boolean;
  disabled: boolean;
  /** Puzzle solved: the gaps close and the missing piece fades in. */
  complete: boolean;
  /** A SHUFFLE is sliding the tiles (slightly quicker slides). */
  shuffling?: boolean;
  onTap: (cell: number) => void;
  onSwipe: (cell: number, dir: ArtDirection) => void;
}

const SWIPE_PX = 22;

/** The board has the painting's own proportions and its tiles show the whole image, uncropped. */
export function ArtBoard({ board, dims, artwork, showNumbers, disabled, complete, shuffling, onTap, onSwipe }: Props) {
  const { cols, rows } = dims;
  const start = useRef<{ cell: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);

  // one entry per tile id (the missing piece is the last id), in id order so DOM nodes are stable and animate
  const cellOf = new Map<number, number>();
  board.forEach((t, cell) => t !== null && cellOf.set(t, cell));
  const total = cols * rows;
  const ids = Array.from({ length: total }, (_, i) => i);

  return (
    <div
      className={`aboard${complete ? ' complete' : ''}${shuffling ? ' shuffling' : ''}`}
      style={{ ['--aspect' as string]: `${artwork.width} / ${artwork.height}` }}
      role="group"
      aria-label={`${cols} × ${rows}`}
      onPointerDown={(e) => {
        const el = (e.target as HTMLElement).closest('[data-cell]') as HTMLElement | null;
        start.current = el ? { cell: Number(el.dataset.cell), x: e.clientX, y: e.clientY } : null;
        swiped.current = false;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s || disabled) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
        swiped.current = true;
        onSwipe(s.cell, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      }}
      onPointerCancel={() => (start.current = null)}
    >
      {ids.map((id) => {
        const cell = cellOf.get(id);
        const isGhost = id === total - 1; // the piece that is missing from the start
        const at = cell ?? total - 1;
        const row = Math.floor(at / cols);
        const col = at % cols;
        const bg = tileBackground(dims, Math.floor(id / cols), id % cols);
        return (
          <div
            key={id}
            className={`apiece${isGhost ? ' ghost' : ''}`}
            style={{ left: `${(col / cols) * 100}%`, top: `${(row / rows) * 100}%`, width: `${100 / cols}%`, height: `${100 / rows}%` }}
          >
            <button
              type="button"
              className="atile"
              data-cell={cell ?? ''}
              data-tile={id}
              aria-label={`${id + 1}`}
              disabled={disabled || cell === undefined}
              tabIndex={cell === undefined ? -1 : 0}
              aria-hidden={isGhost && !complete ? true : undefined}
              onClick={() => {
                if (swiped.current) {
                  swiped.current = false;
                  return;
                }
                if (cell !== undefined) onTap(cell);
              }}
              style={{ backgroundImage: `url(${artwork.imageUrl})`, backgroundSize: bg.size, backgroundPosition: bg.position }}
            >
              {showNumbers && !isGhost && <span className="anum">{id + 1}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
