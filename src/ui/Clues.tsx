import { canApply, isFullyRevealed, maskedWord, nextExtraPosition, type CardHint, type HintKind } from '../core/hints';
import type { WordEntry } from '../core/types';

interface Props {
  clues: WordEntry[];
  cards: CardHint[];
  found: boolean[];
  selCard: number | null;
  selRow: number | null;
  disabled: boolean;
  onSelect: (card: number) => void;
  onHint: (card: number, kind: HintKind) => void;
}

const BTN: { kind: HintKind; label: string; title: string }[] = [
  { kind: 'category', label: 'Category', title: 'Reveal the category' },
  { kind: 'definition', label: 'Meaning', title: 'Reveal the meaning' },
  { kind: 'first', label: '1st letter', title: 'Reveal the first letter' },
  { kind: 'extra', label: '+ Letter', title: 'Reveal one more letter (needs the first letter)' },
];

export function Clues({ clues, cards, found, selCard, selRow, disabled, onSelect, onHint }: Props) {
  return (
    <section className="clues" aria-label="Word clues">
      <h2>WORD CLUES</h2>
      <div className="clue-grid">
        {clues.map((clue, i) => {
          const card = cards[i];
          const done = found[i];
          const incompatible = selRow !== null && (selRow === 3) !== (i === 3);
          const known = isFullyRevealed(card, clue.word);
          const mask = maskedWord(clue.word, card);
          return (
            <div
              key={i}
              data-testid={`card-${i}`}
              className={`clue${selCard === i ? ' selected' : ''}${done ? ' done' : ''}${incompatible ? ' dim' : ''}`}
            >
              <button
                type="button"
                className="clue-head"
                data-testid={`select-card-${i}`}
                aria-pressed={selCard === i}
                disabled={disabled}
                onClick={() => onSelect(i)}
              >
                <span>WORD {i + 1}</span>
                <span className="len">{clue.word.length} letters{done ? ' ✓' : known ? ' · known' : ''}</span>
              </button>
              <div className="clue-cat" data-testid={`cat-${i}`}>{card.category ? clue.category : '? ? ?'}</div>
              <div className="clue-slots" data-testid={`slots-${i}`} aria-label={done ? clue.word : mask.map((c) => c ?? 'blank').join(' ')}>
                {clue.word.split('').map((ch, k) => (
                  <span key={k} className={`slot-l${done ? ' ok' : mask[k] ? ' shown' : ''}`}>
                    {done || mask[k] ? ch : ''}
                  </span>
                ))}
              </div>
              {card.definition && <p className="clue-def" data-testid={`def-${i}`}>{clue.definition}</p>}
              {!done && !disabled && (
                <div className="clue-btns">
                  {BTN.map(({ kind, label, title }) => {
                    const ok = canApply(card, kind, clue.word);
                    if (!ok && (kind === 'category' || kind === 'definition' || kind === 'first')) return null;
                    if (kind === 'extra' && nextExtraPosition(card, clue.word) === null) return null;
                    return (
                      <button key={kind} type="button" className="hint-btn" title={title} data-testid={`hint-${kind}-${i}`} disabled={!ok} onClick={() => onHint(i, kind)}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
