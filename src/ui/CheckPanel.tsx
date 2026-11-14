import { isValidPair } from '../core/game';
import { useT } from '../i18n';

interface Props {
  selRow: number | null;
  selCard: number | null;
  disabled: boolean;
  onRow: (row: number) => void;
  onCheck: () => void;
  onRestart: () => void;
  extra?: React.ReactNode;
}

export function CheckPanel({ selRow, selCard, disabled, onRow, onCheck, onRestart, extra }: Props) {
  const t = useT();
  const ready = selRow !== null && selCard !== null && isValidPair(selRow, selCard);
  const msg = ready ? `${t('word.row')} ${selRow + 1} → ${t('word.card')} ${selCard + 1}` : '';
  return (
    <div className="check-panel">
      <div className="row-pick" role="group" aria-label={t('word.row')}>
        <span className="rp-label">{t('word.row')}</span>
        {[0, 1, 2, 3].map((r) => (
          <button key={r} type="button" className={`chip${selRow === r ? ' on' : ''}`} data-testid={`row-${r}`} aria-pressed={selRow === r} disabled={disabled} onClick={() => onRow(r)}>
            {r + 1}
          </button>
        ))}
      </div>
      <p className="check-msg" data-testid="check-msg">{msg}</p>
      <div className="actions">
        <button className="btn primary" disabled={disabled || !ready} onClick={onCheck}>{t('word.check')}</button>
        <button className="btn" onClick={onRestart}>{t('word.restart')}</button>
        {extra}
      </div>
    </div>
  );
}
