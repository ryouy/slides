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
  const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function nativeShare() {
    try {
      await navigator.share({ text: shareText, url: shareUrl });
    } catch {
      /* cancelled */
    }
  }
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
      <div className="modal">
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
        <div className="actions">
          <button className="btn" data-testid="share-toggle" aria-expanded={panel} onClick={() => setPanel((o) => !o)}>{t('share.share')}</button>
          {secondary && <button className="btn" onClick={secondary.onClick}>{secondary.label}</button>}
          <button className="btn primary" onClick={onNext}>{nextLabel}</button>
        </div>
        {panel && (
          <div className="share-panel" data-testid="share-panel">
            <p className="share-text" data-testid="share-text">{shareText}<br /><span className="share-url">{shareUrl}</span></p>
            <div className="share-row">
              {canNative && <button className="btn" onClick={nativeShare}>{t('share.share')}</button>}
              <a className="btn" href={links.x} target="_blank" rel="noopener noreferrer" data-testid="share-x">X</a>
              <a className="btn" href={links.line} target="_blank" rel="noopener noreferrer" data-testid="share-line">LINE</a>
              <a className="btn" href={links.facebook} target="_blank" rel="noopener noreferrer" data-testid="share-facebook">Facebook</a>
              <button className="btn" data-testid="share-copy" onClick={copy}>{t('share.copy')}</button>
            </div>
            <p className="share-msg" role="status">{msg}</p>
          </div>
        )}
        <button className="link-btn" onClick={onHome}>{t('art.backHome')}</button>
      </div>
    </div>
  );
}
