import { isNoHintClear, type GameState } from '../core/game';
import { totalHintUse } from '../core/hints';
import { formatTime } from '../storage/stats';
import { ResultModal } from '../components/ResultModal';
import { useT } from '../i18n';
import { siteOrigin } from '../utils/share';

interface Props {
  state: GameState;
  onClose: () => void;
  onNext: () => void;
  onHome: () => void;
  nextLabel: string;
}

export function ClearModal({ state, onClose, onNext, onHome, nextLabel }: Props) {
  const t = useT();
  const w = state.puzzle.words;
  const p = state.puzzle;
  const text = (p.mode === 'daily' ? t('share.wordDaily', { n: p.number ?? '', time: formatTime(state.elapsedMs), moves: state.moves, checks: state.checks }) : t('share.word', { time: formatTime(state.elapsedMs), moves: state.moves, checks: state.checks })) + (isNoHintClear(state) ? ' ✨' : '');
  return (
    <ResultModal
      stats={[
        { label: t('common.time'), value: formatTime(state.elapsedMs) },
        { label: t('common.moves'), value: state.moves },
        { label: t('word.checks'), value: state.checks },
      ]}
      shareText={text}
      shareUrl={`${siteOrigin()}/word-slide`}
      onClose={onClose}
      onNext={onNext}
      onHome={onHome}
      nextLabel={nextLabel}
      footer={<span data-testid="hint-sum" hidden>{totalHintUse(state.hintUse)}</span>}
    >
      {isNoHintClear(state) && <div className="no-hint" data-testid="no-hint">{t('word.noHint')}</div>}
      <ul className="words">
        {[...w.top, w.bottom].map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </ResultModal>
  );
}
