import { useRef } from 'react';
import type { ArtBoard as Board, ArtDirection } from '../logic/board';
import { tileBackground } from '../logic/tiles';
import type { Artwork } from '../types';

interface Props {
  board: Board;
  n: number;
  artwork: Artwork;
  showNumbers: boolean;
  disabled: boolean;
  /** Puzzle solved: the gaps close and the missing piece fades in. */
  complete: boolean;
  onTap: (cell: number) => void;
  onSwipe: (cell: number, dir: ArtDirection) => void;
}

const SWIPE_PX = 22;

export function ArtBoard({ board, n, artwork, showNumbers, disabled, complete, onTap, onSwipe }: Props) {
  const start = useRef<{ cell: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);

  // one entry per tile id (the missing piece is id n*n-1), in id order so DOM nodes are stable and animate
  const cellOf = new Map<number, number>();
  board.forEach((t, cell) => t !== null && cellOf.set(t, cell));
  const ids = Array.from({ length: n * n }, (_, i) => i);

  return (
    <div
      className={`aboard${complete ? ' complete' : ''}`}
      style={{ ['--n' as string]: n }}
      role="group"
      aria-label={`Puzzle board ${n} by ${n}`}
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
        const isGhost = id === n * n - 1; // the piece that is missing from the start
        const at = cell ?? n * n - 1;
        const row = Math.floor(at / n);
        const col = at % n;
        const bg = tileBackground(artwork.width, artwork.height, n, Math.floor(id / n), id % n, artwork.focus);
        return (
          <div
            key={id}
            className={`apiece${isGhost ? ' ghost' : ''}`}
            style={{ left: `${(col / n) * 100}%`, top: `${(row / n) * 100}%`, width: `${100 / n}%`, height: `${100 / n}%` }}
          >
            <button
              type="button"
              className="atile"
              data-cell={cell ?? ''}
              data-tile={id}
              aria-label={`Tile ${id + 1}, row ${row + 1}, column ${col + 1}`}
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
