import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { shareLinks } from '../utils/share';

interface Props {
  stats: { label: string; value: string | number }[];
  /** The message with the player's result worked into it (the link is added separately). */
  shareText: string;
  shareUrl: string;
  onClose: () => void;
  onNext: () => void;
  onHome: () => void;
  nextLabel: string;
  /** Game-specific content shown above the stats (e.g. the found words). */
  children?: ReactNode;
  /** Game-specific content shown below the stats. */
  footer?: ReactNode;
  /** Heading (default: "CLEARED!"). */
  heading?: string;
  /** An extra button between SHARE and the main action. */
  secondary?: { label: string; onClick: () => void };
}

/** Shared result screen used by all games. */
export function ResultModal({ stats, shareText, shareUrl, onClose, onNext, onHome, nextLabel, children, footer, heading, secondary }: Props) {
  const t = useT();
  const [panel, setPanel] = useState(false);
  const [msg, setMsg] = useState('');
  const links = shareLinks(shareText, shareUrl);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setMsg(t('share.copied'));
    } catch {
      setMsg(t('share.copyFailed'));
    }
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={heading ?? t('result.cleared')}>
      <div className="modal result-modal">
        <button className="icon-btn close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        <h2 className="clear-title">{heading ?? t('result.cleared')}</h2>
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
        <div className="actions result-actions">
          <button className="btn" data-testid="share-toggle" aria-controls="result-share-panel" aria-expanded={panel} onClick={() => setPanel((o) => !o)}>{t('share.share')}</button>
          {secondary && <button className="btn" onClick={secondary.onClick}>{secondary.label}</button>}
          <button className="btn primary" onClick={onNext}>{nextLabel}</button>
        </div>
        <div className="share-panel" id="result-share-panel" data-open={panel} aria-hidden={!panel} data-testid="share-panel">
          <p className="share-text" data-testid="share-text">{shareText}</p>
          <div className="share-row">
            <a className="btn" href={links.x} target="_blank" rel="noopener noreferrer" data-testid="share-x">X</a>
            <a className="btn" href={links.line} target="_blank" rel="noopener noreferrer" data-testid="share-line">LINE</a>
            <button className="btn" type="button" data-testid="share-copy" onClick={copy}>{t('share.copy')}</button>
          </div>
          {msg && <p className="share-msg" role="status">{msg}</p>}
        </div>
        <button className="link-btn result-home" onClick={onHome}>{t('art.backHome')}</button>
      </div>
    </div>
  );
}
