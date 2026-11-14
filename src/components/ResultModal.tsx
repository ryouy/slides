import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';

interface Props {
  stats: { label: string; value: string | number }[];
  /** Human-readable result text. The URL is supplied separately to the native share sheet. */
  shareText: string;
  shareUrl: string;
  onClose: () => void;
  onNext: () => void;
  onHome: () => void;
  nextLabel: string;
  children?: ReactNode;
  footer?: ReactNode;
  heading?: string;
  secondary?: { label: string; onClick: () => void };
}

/** Shared result screen used by all games, with a single native share action. */
export function ResultModal({ stats, shareText, shareUrl, onClose, onNext, onHome, nextLabel, children, footer, heading, secondary }: Props) {
  const t = useT();
  const [msg, setMsg] = useState('');

  async function share() {
    setMsg('');
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        // A user gesture invokes iOS/Android/Web Share. Do not embed the URL in text.
        await navigator.share({ text: shareText, url: shareUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Some browsers expose share() but reject it; fall through to Copy.
      }
    }
    try {
      // Desktop browsers without Web Share get the same content via clipboard.
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
          <button className="btn" type="button" data-testid="share-toggle" onClick={share}>{t('share.share')}</button>
          {secondary && <button className="btn" onClick={secondary.onClick}>{secondary.label}</button>}
          <button className="btn primary" onClick={onNext}>{nextLabel}</button>
        </div>
        {msg && <p className="share-msg result-share-status" role="status">{msg}</p>}
        <button className="link-btn result-home" onClick={onHome}>{t('art.backHome')}</button>
      </div>
    </div>
  );
}
