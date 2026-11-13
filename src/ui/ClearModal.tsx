import { useState } from 'react';
import type { GameState } from '../core/game';
import { formatTime } from '../storage/stats';

export function shareText(s: GameState): string {
  const p = s.puzzle;
  const name = p.mode === 'daily' ? `WORD SLIDE #${p.number}` : `WORD SLIDE (${p.difficulty})`;
  const url = typeof location !== 'undefined' ? location.origin : '';
  return `${name}\n⏱ ${formatTime(s.elapsedMs)}  🔀 ${s.moves} moves  🔍 ${s.checks} checks\n${url}`;
}

interface Props {
  state: GameState;
  onClose: () => void;
  onNext: () => void;
  onHome: () => void;
  nextLabel: string;
}

export function ClearModal({ state, onClose, onNext, onHome, nextLabel }: Props) {
  const [msg, setMsg] = useState('');
  const w = state.puzzle.words;

  async function share() {
    const text = shareText(state);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Copied to clipboard!');
    } catch {
      setMsg('Could not copy. Select and copy manually.');
    }
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Puzzle cleared">
      <div className="modal">
        <button className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="clear-title">CLEARED!</h2>
        <ul className="words">
          {[...w.top, w.bottom].map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <div className="stats">
          <div className="stat"><span className="stat-label">TIME</span><span className="stat-value">{formatTime(state.elapsedMs)}</span></div>
          <div className="stat"><span className="stat-label">MOVES</span><span className="stat-value">{state.moves}</span></div>
          <div className="stat"><span className="stat-label">CHECKS</span><span className="stat-value">{state.checks}</span></div>
        </div>
        <div className="actions">
          <button className="btn" onClick={share}>SHARE</button>
          <button className="btn primary" onClick={onNext}>{nextLabel}</button>
        </div>
        <p className="share-msg" role="status">{msg}</p>
        <button className="link-btn" onClick={onHome}>Back to home</button>
      </div>
    </div>
  );
}
