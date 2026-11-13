import { useRef } from 'react';
import { type Board as BoardT, type Direction, type Mark } from '../core/types';
import { col, row } from '../core/board';

interface Props {
  board: BoardT;
  marks: (Mark | null)[] | null;
  foundRows: boolean[];
  selRow: number | null;
  disabled: boolean;
  onTile: (cell: number) => void;
  onSwipe: (dir: Direction) => void;
}

const SWIPE_PX = 24;

export function Board({ board, marks, foundRows, selRow, disabled, onTile, onSwipe }: Props) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const tiles = board
    .map((t, cell) => ({ t, cell }))
    .filter((x): x is { t: NonNullable<typeof x.t>; cell: number } => x.t !== null)
    .sort((a, b) => a.t.id - b.t.id); // stable DOM order so tiles animate instead of remounting

  return (
    <div
      className="board"
      role="grid"
      aria-label="Puzzle board"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
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
        onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      }}
      onPointerCancel={() => (start.current = null)}
    >
      {selRow !== null && (
        <div className="row-sel" data-row={selRow} style={{ ['--r' as string]: selRow, ['--w' as string]: selRow === 3 ? 0.75 : 1 }} />
      )}
      {tiles.map(({ t, cell }) => {
        const mark = marks?.[cell] ?? null;
        const found = foundRows[row(cell)] && cell < 15 && !mark;
        return (
          <div
            key={t.id}
            className="tile-pos"
            style={{ ['--x' as string]: col(cell), ['--y' as string]: row(cell) }}
          >
            <button
              type="button"
              className={`tile${mark ? ` m-${mark}` : ''}${found ? ' found' : ''}`}
              data-cell={cell}
              data-letter={t.letter}
              aria-label={`${t.letter}, row ${row(cell) + 1}, column ${col(cell) + 1}${mark ? `, ${mark}` : ''}`}
              disabled={disabled}
              onClick={() => {
                if (swiped.current) {
                  swiped.current = false;
                  return;
                }
                onTile(cell);
              }}
            >
              {t.letter}
            </button>
          </div>
        );
      })}
    </div>
  );
}
