import { useRef } from 'react';
import { DELTA, type BigDirection, type Piece } from '../logic/types';

const SWIPE_PX = 22;
const ARROW: Record<BigDirection, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

interface Props {
  pieces: Piece[];
  goal: Piece[];
  size: number;
  selectedId: number | null;
  /** Legal directions of the selected piece. */
  selectedDirs: BigDirection[];
  shakeId: number | null;
  disabled: boolean;
  onTap: (id: number) => void;
  onMove: (id: number, dir: BigDirection) => void;
}

export function BigBoard({ pieces, goal, size, selectedId, selectedDirs, shakeId, disabled, onTap, onMove }: Props) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const goalOf = new Map(goal.map((g) => [g.id, g]));
  const ordered = [...pieces].sort((a, b) => a.id - b.id); // stable DOM order => pieces animate, never remount

  return (
    <div
      className="bboard"
      style={{ ['--n' as string]: size }}
      role="group"
      aria-label={`Puzzle board ${size} by ${size}`}
      onPointerDown={(e) => {
        const el = (e.target as HTMLElement).closest('[data-piece]') as HTMLElement | null;
        start.current = el ? { id: Number(el.dataset.piece), x: e.clientX, y: e.clientY } : null;
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
        onMove(s.id, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      }}
      onPointerCancel={() => (start.current = null)}
    >
      <div className="bgrid">
        <div className="bslots" aria-hidden="true">
          {Array.from({ length: size * size }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        {ordered.map((p) => {
          const g = goalOf.get(p.id)!;
          const home = g.r === p.r && g.c === p.c;
          const sel = selectedId === p.id;
          return (
            <div
              key={p.id}
              className="bpiece"
              data-piece={p.id}
              data-kind={p.kind}
              data-r={p.r}
              data-c={p.c}
              style={{ left: `${(p.c / size) * 100}%`, top: `${(p.r / size) * 100}%`, width: `${(p.w / size) * 100}%`, height: `${(p.h / size) * 100}%` }}
            >
              <button
                type="button"
                className={`bt ${p.kind}${home ? ' home' : ''}${sel ? ' sel' : ''}${shakeId === p.id ? ' shake' : ''}`}
                aria-label={p.kind === 'big' ? `Big tile, row ${p.r + 1}, column ${p.c + 1}` : `Tile ${p.label}, row ${p.r + 1}, column ${p.c + 1}`}
                disabled={disabled}
                onClick={() => {
                  if (swiped.current) {
                    swiped.current = false;
                    return;
                  }
                  onTap(p.id);
                }}
              >
                {p.label}
              </button>
              {sel &&
                selectedDirs.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`arrow ${d}`}
                    data-testid={`arrow-${d}`}
                    aria-label={`Move ${p.label} ${d}`}
                    onClick={() => onMove(p.id, d)}
                  >
                    {ARROW[d]}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { DELTA };

/** Small non-interactive picture of the goal layout. */
export function GoalMini({ goal, size }: { goal: Piece[]; size: number }) {
  return (
    <div className="gmini" style={{ ['--n' as string]: size }} role="img" aria-label="Goal layout" data-testid="goal-mini">
      <div className="bgrid">
        <div className="bslots" aria-hidden="true">
          {Array.from({ length: size * size }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        {goal.map((p) => (
          <div
            key={p.id}
            className="bpiece"
            style={{ left: `${(p.c / size) * 100}%`, top: `${(p.r / size) * 100}%`, width: `${(p.w / size) * 100}%`, height: `${(p.h / size) * 100}%` }}
          >
            <span className={`bt mini ${p.kind}`}>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
