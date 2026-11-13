import { isNoHintClear, type GameState } from '../core/game';
import { totalHintUse } from '../core/hints';
import { formatTime } from '../storage/stats';
import { ResultModal } from '../components/ResultModal';

export function shareText(s: GameState): string {
  const p = s.puzzle;
  const name = p.mode === 'daily' ? `WORD SLIDE #${p.number}` : `WORD SLIDE (${p.difficulty})`;
  const url = typeof location !== 'undefined' ? location.origin : '';
  const tag = isNoHintClear(s) ? '\nNO HINT CLEAR ✨' : '';
  return `${name}\n⏱ ${formatTime(s.elapsedMs)}  🔀 ${s.moves} moves  🔍 ${s.checks} checks  💡 ${totalHintUse(s.hintUse)} hints\n${url}${tag}`;
}

interface Props {
  state: GameState;
  onClose: () => void;
  onNext: () => void;
  onHome: () => void;
  nextLabel: string;
}

export function ClearModal({ state, onClose, onNext, onHome, nextLabel }: Props) {
  const w = state.puzzle.words;
  return (
    <ResultModal
      stats={[
        { label: 'TIME', value: formatTime(state.elapsedMs) },
        { label: 'MOVES', value: state.moves },
        { label: 'CHECKS', value: state.checks },
      ]}
      shareText={shareText(state)}
      onClose={onClose}
      onNext={onNext}
      onHome={onHome}
      nextLabel={nextLabel}
      footer={
        <p className="hint-sum" data-testid="hint-sum">
          Hints: {state.hintUse.category} category · {state.hintUse.definition} meaning · {state.hintUse.first} first letter · {state.hintUse.extra} extra letter
        </p>
      }
    >
      {isNoHintClear(state) && <div className="no-hint" data-testid="no-hint">NO HINT CLEAR</div>}
      <ul className="words">
        {[...w.top, w.bottom].map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </ResultModal>
  );
}
