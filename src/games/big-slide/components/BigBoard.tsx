import { useRef } from 'react';
import { cellsOf } from '../logic/board';
import { DELTA, type BigDirection, type Piece } from '../logic/types';

const SWIPE_PX = 22;
const ARROW: Record<BigDirection, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

const isRect = (p: Piece) => cellsOf(p).length === p.w * p.h;
const bigFont = (p: Piece) => `calc(100cqw / var(--n) * ${(0.26 * Math.min(p.w, p.h) + 0.04).toFixed(2)})`;

/** Cells of a non-rectangular block, merged visually into one shape (no gaps between neighbouring cells). */
function ShapeCells({ p }: { p: Piece }) {
  const cells = cellsOf(p);
  const has = new Set(cells.map(([r, c]) => r * 16 + c));
  const G = 3; // px gap kept at notches so neighbouring pieces do not touch
  // label sits on the cell nearest to the centroid
  const cr = cells.reduce((a, [r]) => a + r, 0) / cells.length;
  const cc = cells.reduce((a, [, c]) => a + c, 0) / cells.length;
  const lab = cells.reduce((best, x) => (Math.hypot(x[0] - cr, x[1] - cc) < Math.hypot(best[0] - cr, best[1] - cc) ? x : best), cells[0]);
  return (
    <>
      {cells.map(([r, c]) => {
        const top = !has.has((r - 1) * 16 + c);
        const bottom = !has.has((r + 1) * 16 + c);
        const left = !has.has(r * 16 + c - 1);
        const right = !has.has(r * 16 + c + 1);
        const inset = (outer: boolean, edge: boolean) => (outer && !edge ? G : 0);
        const R = 14;
        return (
          <span
            key={`${r}.${c}`}
            className="cell"
            style={{
              left: `${(c / p.w) * 100}%`,
              top: `${(r / p.h) * 100}%`,
              width: `${100 / p.w}%`,
              height: `${100 / p.h}%`,
              padding: `${inset(top, r === 0)}px ${inset(right, c === p.w - 1)}px ${inset(bottom, r === p.h - 1)}px ${inset(left, c === 0)}px`,
            }}
          >
            <i
              style={{
                borderRadius: `${top && left ? R : 0}px ${top && right ? R : 0}px ${bottom && right ? R : 0}px ${bottom && left ? R : 0}px`,
              }}
            />
          </span>
        );
      })}
      <span className="shape-label" style={{ left: `${(lab[1] / p.w) * 100}%`, top: `${(lab[0] / p.h) * 100}%`, width: `${100 / p.w}%`, height: `${100 / p.h}%` }}>
        {p.label}
      </span>
    </>
  );
}

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
                className={`bt ${p.kind}${p.kind === 'big' ? ` b${p.id % 3}` : ''}${!isRect(p) ? ' shaped' : ''}${home ? ' home' : ''}${sel ? ' sel' : ''}${shakeId === p.id ? ' shake' : ''}`}
                style={p.kind === 'big' && isRect(p) ? { fontSize: bigFont(p) } : undefined}
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
                {isRect(p) ? p.label : <ShapeCells p={p} />}
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
            <span className={`bt mini ${p.kind}${p.kind === 'big' ? ` b${p.id % 3}` : ''}${!isRect(p) ? ' shaped' : ''}`} style={p.kind === 'big' && isRect(p) ? { fontSize: bigFont(p) } : undefined}>
              {isRect(p) ? p.label : <ShapeCells p={p} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
