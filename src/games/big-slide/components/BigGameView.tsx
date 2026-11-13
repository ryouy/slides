import { BackButton } from '../../../components/Icons';
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { AdSlot } from '../../../ads/AdSlot';
import { ResultModal } from '../../../components/ResultModal';
import { useT } from '../../../i18n';
import { siteOrigin } from '../../../utils/share';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { formatTime } from '../../../storage/stats';
import { legalDirs, legalMoves } from '../logic/board';
import { bigReducer, type BigState } from '../logic/game';
import { DELTA, type BigDirection } from '../logic/types';
import { BigBoard, GoalMini } from './BigBoard';

const KEY_DIR: Record<string, BigDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

interface Props {
  initial: BigState;
  title: string;
  onProgress: (s: BigState) => void;
  onCleared: (s: BigState) => void;
  onNext: () => void;
  nextLabel: string;
  onBack: () => void;
  headerRight?: ReactNode;
  footerExtra?: ReactNode;
}

export function BigGameView({ initial, title, onProgress, onCleared, onNext, nextLabel, onBack, headerRight, footerExtra }: Props) {
  const t = useT();
  const [state, dispatch] = useReducer(bigReducer, initial);
  const [showClear, setShowClear] = useState(initial.status === 'cleared');
  const [goalOpen, setGoalOpen] = useState(true);
  const [shakeId, setShakeId] = useState<number | null>(null);
  const recorded = useRef(initial.status === 'cleared');
  const n = state.puzzle.size;
  const cleared = state.status === 'cleared';

  useGameTimer((ms) => dispatch({ type: 'tick', ms }));

  const shake = (id: number) => {
    setShakeId(id);
    setTimeout(() => setShakeId((cur) => (cur === id ? null : cur)), 350);
  };

  const move = (id: number, dir: BigDirection) => {
    if (!legalDirs(state.pieces, n, id).includes(dir)) {
      shake(id); // illegal: board unchanged
      dispatch({ type: 'select', id: null });
      return;
    }
    dispatch({ type: 'move', id, dir });
  };

  const tap = (id: number) => {
    const dirs = legalDirs(state.pieces, n, id);
    if (dirs.length === 1) dispatch({ type: 'move', id, dir: dirs[0] });
    else if (dirs.length > 1) dispatch({ type: 'select', id: state.selected === id ? null : id });
    else {
      shake(id);
      dispatch({ type: 'select', id: null });
    }
  };

  // keyboard: arrow = direction the piece moves. Uses the selected piece, else the only piece that can go that way.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (!dir || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      if (state.selected !== null && legalDirs(state.pieces, n, state.selected).includes(dir)) {
        dispatch({ type: 'move', id: state.selected, dir });
        return;
      }
      const cands = legalMoves(state.pieces, n).filter((m) => m.dir === dir);
      if (cands.length === 1) dispatch({ type: 'move', id: cands[0].id, dir });
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [state.pieces, state.selected, n]);

  useEffect(() => {
    onProgress(state);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.status === 'cleared' && !recorded.current) {
      recorded.current = true;
      onCleared(state);
      const id = setTimeout(() => setShowClear(true), 450);
      return () => clearTimeout(id);
    }
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDirs = state.selected === null ? [] : legalDirs(state.pieces, n, state.selected);
  void DELTA;

  return (
    <div className="screen game bigslide">
      <header className="topbar">
        <BackButton onClick={onBack} label={t('common.back')} />
        <h1>{title}</h1>
        <div className="top-right">{headerRight}</div>
      </header>

      <div className="stats" aria-live="polite">
        <Stat label={t('common.time')} value={formatTime(state.elapsedMs)} id="time" />
        <Stat label={t('common.moves')} value={String(state.moves)} id="moves" />
        <Stat label={t('big.bigMoves')} value={String(state.bigMoves)} id="bigmoves" />
      </div>

      <BigBoard
        pieces={state.pieces}
        goal={state.puzzle.goal}
        size={n}
        selectedId={state.selected}
        selectedDirs={selectedDirs}
        shakeId={shakeId}
        disabled={cleared}
        onTap={tap}
        onMove={move}
      />

      <div className="big-controls">
        <div className="goal-box">
          <button className="goal-toggle" aria-expanded={goalOpen} onClick={() => setGoalOpen((o) => !o)} data-testid="goal-toggle">
            {t('big.goal')} {goalOpen ? '▾' : '▸'}
          </button>
          {goalOpen && <GoalMini goal={state.puzzle.goal} size={n} />}
        </div>
        <div className="actions col">
          <button className="btn" onClick={() => dispatch({ type: 'restart' })}>{t('big.restart')}</button>
          {footerExtra}
        </div>
      </div>

      <AdSlot side />

      {cleared && showClear && (
        <ResultModal
          stats={[
            { label: t('common.time'), value: formatTime(state.elapsedMs) },
            { label: t('common.moves'), value: state.moves },
            { label: t('big.bigMoves'), value: state.bigMoves },
          ]}
          shareText={state.puzzle.mode === 'daily' ? t('share.bigDaily', { n: state.puzzle.number ?? '', time: formatTime(state.elapsedMs), moves: state.moves }) : t('share.big', { size: state.puzzle.size, time: formatTime(state.elapsedMs), moves: state.moves })}
          shareUrl={`${siteOrigin()}/big-slide`}
          onClose={() => setShowClear(false)}
          onNext={onNext}
          onHome={onBack}
          nextLabel={nextLabel}
        />
      )}
      {cleared && !showClear && (
        <button className="btn primary wide" onClick={() => setShowClear(true)}>Show result</button>
      )}
    </div>
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
