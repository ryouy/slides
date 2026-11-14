import { BackButton, ChevronRight } from '../../../components/Icons';
import { useEffect, useReducer, useRef, useState } from 'react';
import { AdSlot } from '../../../ads/AdSlot';
import { ResultModal } from '../../../components/ResultModal';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { useImageStatus } from '../../../hooks/useImageStatus';
import { useLang, useT, type Key } from '../../../i18n';
import { formatTime } from '../../../storage/stats';
import { artShareUrl } from '../../../utils/share';
import { ART_LEVELS, canMove, neighbors, type ArtDirection, type ArtLevel } from '../logic/board';
import { artReducer, dimsOf, type ArtState } from '../logic/game';
import { aspectOf, gridFor } from '../logic/grid';
import { visibleShuffleStepMs } from '../logic/generator';
import { planReshuffle } from '../logic/reshuffle';
import type { Artwork } from '../types';
import { ArtLevelMenu } from './ArtLevelMenu';
import { ArtBoard } from './ArtBoard';
import { ArtPreview } from './ArtPreview';

const KEY_DIR: Record<string, ArtDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const DELTA: Record<ArtDirection, number> = { up: -1, down: 1, left: -1, right: 1 }; // sign only; rows use cols

interface Props {
  initial: ArtState;
  artwork: Artwork;
  daily: boolean;
  showNumbers: boolean;
  onToggleNumbers: (v: boolean) => void;
  onProgress: (s: ArtState) => void;
  onCleared: (s: ArtState) => void;
  onBack: () => void;
  /** Free play only */
  onLevel?: (level: ArtLevel) => void;
  onChangeArtwork: () => void;
  onNextArtwork: () => void;
}

export function ArtGameView(p: Props) {
  const { initial, artwork, daily } = p;
  const t = useT();
  const lang = useLang();
  const translatedDescription = lang === 'en' ? undefined : artwork.descriptionTranslations?.[lang];
  const [state, dispatch] = useReducer(artReducer, initial);
  const [preview, setPreview] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<ArtLevel | null>(null);
  const [showResult, setShowResult] = useState(initial.status === 'cleared');
  const [shuffling, setShuffling] = useState(false);
  const shufflingRef = useRef(false);
  const timers = useRef<number[]>([]);
  const stateRef = useRef(initial);
  const recorded = useRef(initial.status === 'cleared');
  const dims = dimsOf(state.puzzle);
  const shuffleStepMs = visibleShuffleStepMs(dims);
  const cleared = state.status === 'cleared';
  const img = useImageStatus(artwork.imageUrl);
  stateRef.current = state;
  const locked = !!preview || cleared || shuffling || img.status !== 'ready';
  const aspect = aspectOf(artwork);

  useGameTimer((ms) => dispatch({ type: 'tick', ms }));

  // keyboard: arrow = direction the tile moves
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
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
    if (locked || !canMove(state.board, dims, cell)) return;
    const blank = state.board.indexOf(null);
    const step = dir === 'up' || dir === 'down' ? dims.cols : 1;
    const target = cell + DELTA[dir] * step;
    if (target === blank && neighbors(cell, dims).includes(blank)) dispatch({ type: 'move', cell });
  };

  const gridLabel = (level: ArtLevel) => {
    const g = gridFor(aspect, level);
    return `${g.cols}×${g.rows}`;
  };
  const chooseLevel = (level: ArtLevel) => {
    if (level === state.puzzle.size) return setPending(null);
    if (state.moves === 0 || cleared) return p.onLevel?.(level);
    setPending(level);
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
    setPreview(null);
    recorded.current = false; // a finished painting can be finished again
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      dispatch({ type: 'reshuffled', puzzle: plan.puzzle });
      return;
    }
    shufflingRef.current = true;
    setShuffling(true);
    plan.clicks.forEach((cell, i) => timers.current.push(window.setTimeout(() => dispatch({ type: 'slideStep', cell }), 60 + i * shuffleStepMs)));
    timers.current.push(
      window.setTimeout(() => {
        shufflingRef.current = false;
        dispatch({ type: 'reshuffled', puzzle: plan.puzzle });
        setShuffling(false);
      }, 60 + plan.clicks.length * shuffleStepMs + Math.max(80, shuffleStepMs * 2)),
    );
  };

  const shareText = daily
    ? t('share.artDaily', { title: artwork.title, artist: artwork.artist, time: formatTime(state.elapsedMs), moves: state.moves, n: state.puzzle.number ?? '' })
    : t('share.artFree', { title: artwork.title, artist: artwork.artist, grid: `${dims.cols}×${dims.rows}`, time: formatTime(state.elapsedMs), moves: state.moves });

  return (
    <div className="screen game artgame">
      <header className={`topbar art-top${daily ? ' art-daily-top' : ''}`}>
        <BackButton onClick={p.onBack} label={t('common.back')} />
        <div className="top-titles">
          {daily && <small className="top-kicker">{t('art.dailyTitle', { n: state.puzzle.number ?? '' })}</small>}
          <h1 data-testid="art-title">{artwork.title}</h1>
          <span className="top-sub">{artwork.artist}, {artwork.year}</span>
        </div>
        <div className="art-header-controls">
          {!daily && (
            <div className="art-mobile-level">
              <select className="art-level-select select" aria-label={t('big.size')} data-testid="art-size-select"
                value={state.puzzle.size} onChange={(e) => {
                  const level = Number(e.target.value);
                  if (ART_LEVELS.some((l) => l === level)) chooseLevel(level as ArtLevel);
                }}>
                {ART_LEVELS.map((l) => <option key={l} value={l}>{gridLabel(l)}</option>)}
              </select>
            </div>
          )}
          <div className="stats art-mobile-stats" aria-live="polite">
            <Stat label={t('common.time')} value={formatTime(state.elapsedMs)} id="time" />
            <Stat label={t('common.moves')} value={String(state.moves)} id="moves" />
          </div>
          <div className={`actions art-actions${daily ? ' daily-actions' : ''}`}>
            <button className="btn" data-testid="preview" aria-label={t('art.preview')} title={t('art.preview')}
              disabled={shuffling} onClick={() => {
                const rect = boardRef.current?.getBoundingClientRect();
                if (rect) setPreview({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
              }}>
              <svg className="art-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>
              <span className="art-action-label">{t('art.preview')}</span>
            </button>
            {!daily && <button className="btn" data-testid="shuffle" aria-label={t('art.shuffle')} title={t('art.shuffle')} disabled={shuffling} onClick={runShuffle}>
              <svg className="art-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4c5 0 5 10 10 10h4m-4-4 4 4-4 4M3 17h4c2 0 3-1 4-3m2-4c1-2 2-3 4-3h4m-4-4 4 4-4 4"/></svg>
              <span className="art-action-label">{t('art.shuffle')}</span>
            </button>}
            <button className={`btn num-btn${p.showNumbers ? ' on' : ''}`} data-testid="numbers-toggle"
              aria-label={t('art.numbers')} title={t('art.numbers')} aria-pressed={p.showNumbers} onClick={() => p.onToggleNumbers(!p.showNumbers)}>
              <span className="num-glyph art-action-icon" aria-hidden="true">#</span>
              <span className="art-action-label">{t('art.numbers')}</span>
            </button>
          </div>
        </div>
      </header>

      {pending !== null && (
        <div className="confirm-bar" role="alert">
          <span>{t('art.confirmLevel', { grid: gridLabel(pending) })}</span>
          <button className="btn primary" data-testid="confirm-size" onClick={() => { const l = pending; setPending(null); p.onLevel?.(l); }}>{t('art.start')}</button>
          <button className="btn" onClick={() => setPending(null)}>{t('common.cancel')}</button>
        </div>
      )}


      {img.status === 'error' ? (
        <div className="aboard art-error" role="alert" data-testid="art-error" style={{ ['--aspect' as string]: `${artwork.width} / ${artwork.height}` }}>
          <p>{t('art.loadError')}</p>
          <div className="actions">
            <button className="btn primary" onClick={img.retry}>{t('art.tryAgain')}</button>
            <button className="btn" onClick={p.onChangeArtwork}>{t('art.chooseOther')}</button>
          </div>
        </div>
      ) : (
        <div className="aboard-wrap" ref={boardRef} style={{ ['--aspect' as string]: aspect, ['--shuffle-tile-ms' as string]: `${Math.round(shuffleStepMs * 0.92)}ms` }}>
          <ArtBoard board={state.board} dims={dims} artwork={artwork} showNumbers={p.showNumbers} disabled={locked} complete={cleared} shuffling={shuffling} onTap={(cell) => dispatch({ type: 'move', cell })} onSwipe={swipe} />
          {img.status === 'loading' && <div className="art-loading" role="status">{t('art.loading')}</div>}
        </div>
      )}


      <div className="art-extra">
        <div className="art-desktop-meta" aria-live="polite">
          {!daily && (
            <ArtLevelMenu
              current={state.puzzle.size}
              getLabel={gridLabel}
              ariaLabel={t('big.size')}
              onSelect={chooseLevel}
              disabled={shuffling}
            />
          )}
          <div className="art-desktop-stats">
            <Stat label={t('common.time')} value={formatTime(state.elapsedMs)} id="time-desktop" />
            <Stat label={t('common.moves')} value={String(state.moves)} id="moves-desktop" />
          </div>
        </div>
        <p className="ap-desc" data-testid="art-desc" lang={translatedDescription ? lang : undefined}>
          {lang === 'en' ? artwork.description : translatedDescription ?? t('art.summary', {
            artist: artwork.artist,
            year: artwork.year,
            theme: t(`theme.${artwork.theme}` as Key),
          })}
        </p>
        <p className="ap-credit">
          {artwork.museum} · <a href={artwork.licenseUrl} target="_blank" rel="noopener noreferrer">CC0</a> · <a href={artwork.sourceUrl} target="_blank" rel="noopener noreferrer">{t('art.source')}</a>
        </p>
        {!daily && (
          <div className="art-quiet">
            <button className="quiet-link" data-testid="change-artwork" onClick={p.onChangeArtwork}>{t('art.change')} <ChevronRight size={14} /></button>
            <button className="quiet-link" data-testid="next-artwork" onClick={p.onNextArtwork}>{t('art.nextArtwork')} <ChevronRight size={14} /></button>
          </div>
        )}
      </div>
      <AdSlot side />

      {preview && <ArtPreview artwork={artwork} rect={preview} label={t('art.preview')} onClosed={() => setPreview(null)} />}

      {cleared && showResult && (
        <ResultModal
          heading={t('art.complete')}
          stats={[
            { label: t('common.time'), value: formatTime(state.elapsedMs) },
            { label: t('common.moves'), value: state.moves },
          ]}
          shareText={shareText}
          shareUrl={artShareUrl(artwork.id, daily)}
          onClose={() => setShowResult(false)}
          onNext={daily ? p.onChangeArtwork : p.onNextArtwork}
          onHome={p.onBack}
          nextLabel={daily ? t('art.moreArtworks') : t('art.nextArtwork')}
          secondary={daily ? undefined : { label: t('art.playAgain'), onClick: runShuffle }}
        >
          <figure className="result-art">
            <img src={artwork.thumbnailUrl} alt={artwork.title} />
            <figcaption>
              <b>{artwork.title}</b>
              <span>{artwork.artist} · {artwork.year}</span>
            </figcaption>
          </figure>
        </ResultModal>
      )}
    </div>
  );
}

function Stat({ label, value, id }: { label: string; value: string; id: string }) {
  return (
    <div className="stat">
      <span className="stat-label"><svg className="art-stat-icon" viewBox="0 0 24 24" aria-hidden="true">{id.startsWith('time') ? <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></> : <><path d="M5 5h14v14H5zM5 12h14M12 5v14"/></>}</svg><span className="art-stat-text">{label}</span></span>
      <span className="stat-value" data-testid={id}>{value}</span>
    </div>
  );
}
