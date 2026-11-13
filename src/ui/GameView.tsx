import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { foundOf, reducer, type CheckEntry, type GameState } from '../core/game';
import type { Direction } from '../core/types';
import { formatTime } from '../storage/stats';
import { AdSlot } from '../ads/AdSlot';
import { useGameTimer } from '../hooks/useGameTimer';
import { useT } from '../i18n';
import { Board } from './Board';
import { CheckPanel } from './CheckPanel';
import { Clues } from './Clues';
import { ClearModal } from './ClearModal';

const KEY_DIR: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

interface Props {
  initial: GameState;
  title: string;
  onProgress: (s: GameState) => void;
  onCleared: (s: GameState) => void;
  onNext: () => void;
  nextLabel: string;
  headerRight?: ReactNode;
  onBack: () => void;
  footerExtra?: ReactNode;
}

export function GameView({ initial, title, onProgress, onCleared, onNext, nextLabel, headerRight, onBack, footerExtra }: Props) {
  const t = useT();
  const [state, dispatch] = useReducer(reducer, initial);
  const [showClear, setShowClear] = useState(initial.status === 'cleared');
  const recorded = useRef(initial.status === 'cleared');

  useGameTimer((ms) => dispatch({ type: 'tick', ms }));

  // keyboard: arrow = direction the tile moves
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (!dir || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      dispatch({ type: 'dir', dir });
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    onProgress(state);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.status === 'cleared' && !recorded.current) {
      recorded.current = true;
      onCleared(state);
      const id = setTimeout(() => setShowClear(true), 450); // let the last slide finish
      return () => clearTimeout(id);
    }
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const found = foundOf(state);
  const cleared = state.status === 'cleared';

  return (
    <div className="screen game">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>←</button>
        <h1>{title}</h1>
        <div className="top-right">{headerRight}</div>
      </header>

      <div className="stats" aria-live="polite">
        <Stat label={t('common.time')} value={formatTime(state.elapsedMs)} id="time" />
        <Stat label={t('common.moves')} value={String(state.moves)} id="moves" />
        <Stat label={t('word.checks')} value={String(state.checks)} id="checks" />
      </div>
      <div className={`found-bar${found.count === 4 ? ' all' : ''}`} data-testid="found">
        <span>{t('word.found')}</span> <b>{found.count} / 4</b>
      </div>

      <Board
        board={state.board}
        marks={state.marks}
        foundRows={found.rows}
        selRow={state.selRow}
        disabled={cleared}
        onTile={(cell) => dispatch({ type: 'move', cell })}
        onSwipe={(dir) => dispatch({ type: 'dir', dir })}
      />

      <CheckPanel
        selRow={state.selRow}
        selCard={state.selCard}
        disabled={cleared}
        onRow={(row) => dispatch({ type: 'selRow', row })}
        onCheck={() => dispatch({ type: 'check' })}
        onRestart={() => dispatch({ type: 'restart' })}
        extra={footerExtra}
      />

      <Clues
        clues={state.puzzle.clues}
        cards={state.cards}
        found={found.cards}
        selCard={state.selCard}
        selRow={state.selRow}
        disabled={cleared}
        onSelect={(card) => dispatch({ type: 'selCard', card })}
        onHint={(card, kind) => dispatch({ type: 'hint', card, kind })}
      />

      <History entries={state.history} />
      <AdSlot />

      {cleared && showClear && (
        <ClearModal state={state} onClose={() => setShowClear(false)} onNext={onNext} nextLabel={nextLabel} onHome={onBack} />
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

function History({ entries }: { entries: CheckEntry[] }) {
  const t = useT();
  if (!entries.length) return null;
  return (
    <section className="history" aria-label="Hint history">
      <h2>{t('word.history')}</h2>
      <ul className="history-list">
        {entries.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
          <li key={i} className="h-row">
            <span className="h-label">#{i + 1} · ROW {e.row + 1} → WORD {e.card + 1}</span>
            <span className="mini">
              {e.cells.map((l, c) => (
                <span key={c} className={`mc${e.marks[c] ? ` m-${e.marks[c]}` : ''}${l === null ? ' blank' : ''}`}>{l}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
