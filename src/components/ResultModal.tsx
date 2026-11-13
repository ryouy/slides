import { useState, type ReactNode } from 'react';

interface Props {
  stats: { label: string; value: string | number }[];
  shareText: string;
  onClose: () => void;
  onNext: () => void;
  onHome: () => void;
  nextLabel: string;
  /** Game-specific content shown above the stats (e.g. the found words). */
  children?: ReactNode;
  /** Game-specific content shown below the stats. */
  footer?: ReactNode;
  /** Heading (default CLEARED!). */
  heading?: string;
  /** An extra button between SHARE and the main action. */
  secondary?: { label: string; onClick: () => void };
}

/** Shared result screen used by both games. */
export function ResultModal({ stats, shareText, onClose, onNext, onHome, nextLabel, children, footer, heading = 'CLEARED!', secondary }: Props) {
  const [msg, setMsg] = useState('');

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setMsg('Copied to clipboard!');
    } catch {
      setMsg('Could not copy. Select and copy manually.');
    }
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Puzzle cleared">
      <div className="modal">
        <button className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="clear-title">{heading}</h2>
        {children}
        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <span className="stat-label">{s.label}</span>
              <span className="stat-value">{s.value}</span>
            </div>
          ))}
        </div>
        {footer}
        <div className="actions">
          <button className="btn" onClick={share}>SHARE</button>
          {secondary && <button className="btn" onClick={secondary.onClick}>{secondary.label}</button>}
          <button className="btn primary" onClick={onNext}>{nextLabel}</button>
        </div>
        <p className="share-msg" role="status">{msg}</p>
        <button className="link-btn" onClick={onHome}>Back to home</button>
      </div>
    </div>
  );
}
