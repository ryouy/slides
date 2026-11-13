import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { AdSlot } from '../../../ads/AdSlot';
import { ResultModal } from '../../../components/ResultModal';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { useImageStatus } from '../../../hooks/useImageStatus';
import { formatTime } from '../../../storage/stats';
import { ART_SIZES, canMove, neighbors, type ArtDirection, type ArtSize } from '../logic/board';
import { artReducer, type ArtState } from '../logic/game';
import { planReshuffle } from '../logic/reshuffle';
import type { Artwork } from '../types';
import { ArtBoard } from './ArtBoard';
import { ArtworkInfo } from './ArtworkInfo';

const KEY_DIR: Record<string, ArtDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
/** Time between two slides of a shuffle (each slide itself takes a little less than this to glide). */
const SHUFFLE_STEP_MS = 95;
const DELTA: Record<ArtDirection, number> = { up: -1, down: 1, left: -1, right: 1 }; // sign only; rows use n

export function artShareText(s: ArtState, artwork: Artwork): string {
  const p = s.puzzle;
  const url = typeof location !== 'undefined' ? `${location.origin}/art-slide` : '';
  // the daily artwork is the same for everyone, so its name is left out (no spoilers)
  const head = p.mode === 'daily' ? `ART SLIDE #${p.number} (${p.size}×${p.size})` : `ART SLIDE ${p.size}×${p.size} · ${artwork.title}`;
  return `${head}\n⏱ ${formatTime(s.elapsedMs)}  🔀 ${s.moves} moves\n${url}`;
}

interface Props {
  initial: ArtState;
  artwork: Artwork;
  title: string;
  daily: boolean;
  showNumbers: boolean;
  onToggleNumbers: (v: boolean) => void;
  onProgress: (s: ArtState) => void;
  onCleared: (s: ArtState) => void;
  onBack: () => void;
  /** Free play only */
  onSize?: (size: ArtSize) => void;
  onChangeArtwork: () => void;
  onNextArtwork: () => void;
}

export function ArtGameView(p: Props) {
  const { initial, artwork, daily } = p;
  const [state, dispatch] = useReducer(artReducer, initial);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState<{ kind: 'size'; size: ArtSize } | { kind: 'shuffle' } | null>(null);
  const [showResult, setShowResult] = useState(initial.status === 'cleared');
  const [shuffling, setShuffling] = useState(false);
  const shufflingRef = useRef(false);
  const timers = useRef<number[]>([]);
  const stateRef = useRef(initial);
  const recorded = useRef(initial.status === 'cleared');
  const n = state.puzzle.size;
  const cleared = state.status === 'cleared';
  const img = useImageStatus(artwork.imageUrl);
  stateRef.current = state;
  const locked = preview || cleared || shuffling || img.status !== 'ready';

  useGameTimer((ms) => dispatch({ type: 'tick', ms }));

  // keyboard: arrow = direction the tile moves
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(false);
      const dir = KEY_DIR[e.key];
      if (!dir || e.metaKey || e.ctrlKey || e.altKey || locked) return;
      e.preventDefault();
      dispatch({ type: 'dir', dir });
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [locked]);

  useEffect(() => {
    if (shufflingRef.current) return; // do not save the half-shuffled board; the finished shuffle is saved
    p.onProgress(state);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (cleared && !recorded.current) {
      recorded.current = true;
      p.onCleared(state);
      const id = setTimeout(() => setShowResult(true), 1100); // let the painting come together first
      return () => clearTimeout(id);
    }
  }, [cleared]); // eslint-disable-line react-hooks/exhaustive-deps

  const swipe = (cell: number, dir: ArtDirection) => {
    if (locked || !canMove(state.board, n, cell)) return;
    const blank = state.board.indexOf(null);
    const step = dir === 'up' || dir === 'down' ? n : 1;
    const target = cell + DELTA[dir] * step;
    if (target === blank && neighbors(cell, n).includes(blank)) dispatch({ type: 'move', cell });
  };

  const chooseSize = (s: ArtSize) => {
    if (s === n) return setPending(null);
    if (state.moves === 0 || cleared) return p.onSize?.(s);
    setPending({ kind: 'size', size: s });
  };
  /**
   * Re-place the pieces randomly by actually sliding them, one legal move after another, starting from
   * what is on screen (also from a finished painting). The result is always solvable.
   */
  const runShuffle = () => {
    if (shufflingRef.current) return;
    const plan = planReshuffle(stateRef.current, `${Date.now()}-${Math.random()}`);
    setPending(null);
    setShowResult(false);
    setPreview(false);
    recorded.current = false; // a finished painting can be finished again
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      dispatch({ type: 'reshuffled', puzzle: plan.puzzle });
      return;
    }
    shufflingRef.current = true;
    setShuffling(true);
    plan.clicks.forEach((cell, i) => timers.current.push(window.setTimeout(() => dispatch({ type: 'slideStep', cell }), 60 + i * SHUFFLE_STEP_MS)));
    timers.current.push(
      window.setTimeout(() => {
        shufflingRef.current = false;
        dispatch({ type: 'reshuffled', puzzle: plan.puzzle });
        setShuffling(false);
      }, 60 + plan.clicks.length * SHUFFLE_STEP_MS + 260),
    );
  };
  /** Ask first when it would throw away progress. */
  const shuffle = () => {
    if (shufflingRef.current) return;
    if (state.moves === 0 || cleared) return runShuffle();
    setPending({ kind: 'shuffle' });
  };

  return (
    <div className="screen game artgame">
      <header className="topbar">
        <button className="icon-btn" onClick={p.onBack} aria-label="Back">←</button>
        <h1>{p.title}</h1>
        <div className="top-right" />
      </header>

      {!daily && (
        <div className="seg" role="group" aria-label="Board size">
          {ART_SIZES.map((s) => (
            <button key={s} className={`seg-btn${n === s ? ' on' : ''}`} aria-pressed={n === s} data-testid={`asize-${s}`} onClick={() => chooseSize(s)}>
              {s}×{s}
            </button>
          ))}
        </div>
      )}
      {pending && (
        <div className="confirm-bar" role="alert">
          <span>{pending.kind === 'size' ? `Start a new ${pending.size}×${pending.size} puzzle? Your progress will be lost.` : 'Shuffle the pieces again? Your progress will be lost.'}</span>
          <button
            className="btn primary"
            data-testid={pending.kind === 'size' ? 'confirm-size' : 'confirm-shuffle'}
            onClick={() => {
              const cur = pending;
              setPending(null);
              if (cur.kind === 'size') p.onSize?.(cur.size);
              else runShuffle();
            }}
          >
            {pending.kind === 'size' ? 'Start' : 'Shuffle'}
          </button>
          <button className="btn" onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}

      <div className="stats" aria-live="polite">
        <Stat label="TIME" value={formatTime(state.elapsedMs)} id="time" />
        <Stat label="MOVES" value={String(state.moves)} id="moves" />
      </div>

      {img.status === 'error' ? (
        <div className="aboard art-error" role="alert" data-testid="art-error">
          <p>This artwork could not be loaded.</p>
          <div className="actions">
            <button className="btn primary" onClick={img.retry}>Try again</button>
            <button className="btn" onClick={p.onChangeArtwork}>Choose another</button>
          </div>
        </div>
      ) : (
        <div className="aboard-wrap">
          <ArtBoard board={state.board} n={n} artwork={artwork} showNumbers={p.showNumbers} disabled={locked} complete={cleared} shuffling={shuffling} onTap={(cell) => dispatch({ type: 'move', cell })} onSwipe={swipe} />
          {img.status === 'loading' && <div className="art-loading" role="status">Loading artwork…</div>}
        </div>
      )}

      <div className="actions">
        <button className="btn" data-testid="preview" disabled={shuffling} onClick={() => setPreview(true)}>PREVIEW</button>
        {!daily && <button className="btn" data-testid="shuffle" disabled={shuffling} onClick={shuffle}>SHUFFLE</button>}
        <button className="btn" disabled={shuffling} onClick={() => dispatch({ type: 'restart' })}>RESTART</button>
      </div>
      <label className="field check numbers-toggle">
        <input type="checkbox" checked={p.showNumbers} onChange={(e) => p.onToggleNumbers(e.target.checked)} />
        Show tile numbers
      </label>

      <ArtworkInfo artwork={artwork} />
      {!daily && <button className="btn wide" onClick={p.onChangeArtwork}>CHANGE ARTWORK</button>}
      <AdSlot />

      {preview && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Artwork preview" onClick={() => setPreview(false)}>
          <div className="modal preview" onClick={(e) => e.stopPropagation()}>
            <img src={artwork.imageUrl} alt={`${artwork.title} by ${artwork.artist}`} width={artwork.width} height={artwork.height} />
            <p className="preview-cap"><b>{artwork.title}</b> · {artwork.artist}, {artwork.year}</p>
            <button className="btn primary" data-testid="preview-close" onClick={() => setPreview(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {cleared && showResult && (
        <ResultModal
          heading="COMPLETE!"
          stats={[
            { label: 'TIME', value: formatTime(state.elapsedMs) },
            { label: 'MOVES', value: state.moves },
          ]}
          shareText={artShareText(state, artwork)}
          onClose={() => setShowResult(false)}
          onNext={daily ? p.onChangeArtwork : p.onNextArtwork}
          onHome={p.onBack}
          nextLabel={daily ? 'MORE ARTWORKS' : 'NEXT ARTWORK'}
          secondary={daily ? undefined : { label: 'PLAY AGAIN', onClick: runShuffle }}
        >
          <ResultArt artwork={artwork} />
        </ResultModal>
      )}
      {cleared && !showResult && <button className="btn primary wide" onClick={() => setShowResult(true)}>Show result</button>}
    </div>
  );
}

function ResultArt({ artwork }: { artwork: Artwork }): ReactNode {
  return (
    <figure className="result-art">
      <img src={artwork.thumbnailUrl} alt={artwork.title} />
      <figcaption>
        <b>{artwork.title}</b>
        <span>{artwork.artist} · {artwork.year}</span>
      </figcaption>
    </figure>
  );
}

function Stat({ label, value, id }: { label: string; value: string; id: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" data-testid={id}>{value}</span>
    </div>
  );
}
