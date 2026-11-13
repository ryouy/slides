import { isValidPair } from '../core/game';

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
  const ready = selRow !== null && selCard !== null && isValidPair(selRow, selCard);
  const msg = ready
    ? `Compare ROW ${selRow + 1} with WORD ${selCard + 1}`
    : selRow === null
      ? 'Pick a row, then a word card below'
      : 'Now pick a word card below';
  return (
    <div className="check-panel">
      <div className="row-pick" role="group" aria-label="Row to check">
        <span className="rp-label">ROW</span>
        {[0, 1, 2, 3].map((r) => (
          <button key={r} type="button" className={`chip${selRow === r ? ' on' : ''}`} data-testid={`row-${r}`} aria-pressed={selRow === r} disabled={disabled} onClick={() => onRow(r)}>
            {r + 1}
          </button>
        ))}
      </div>
      <p className="check-msg" data-testid="check-msg">{msg}</p>
      <div className="actions">
        <button className="btn primary" disabled={disabled || !ready} onClick={onCheck}>CHECK</button>
        <button className="btn" onClick={onRestart}>RESTART</button>
        {extra}
      </div>
    </div>
  );
}
