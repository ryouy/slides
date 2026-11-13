import type { Difficulty } from './types';

/** Revealed hint state of one word card. */
export interface CardHint {
  category: boolean;
  definition: boolean;
  /** Revealed letter positions (kept in the order they were revealed). */
  revealed: number[];
}

export type HintKind = 'category' | 'definition' | 'first' | 'extra';

/** Counts of hints the player actively used (free starting hints are not counted). */
export type HintUse = Record<HintKind, number>;

export const emptyHintUse = (): HintUse => ({ category: 0, definition: 0, first: 0, extra: 0 });
export const totalHintUse = (u: HintUse) => u.category + u.definition + u.first + u.extra;

/** Free starting hints per difficulty. Daily uses 'normal' for everyone. */
export function initialCardHint(difficulty: Difficulty): CardHint {
  return {
    category: difficulty !== 'hard',
    definition: difficulty === 'easy',
    revealed: [],
  };
}

/** Returns the updated card, or null if this hint is not available (already revealed, locked or nothing left). */
export function applyHint(card: CardHint, kind: HintKind, word: string): CardHint | null {
  switch (kind) {
    case 'category':
      return card.category ? null : { ...card, category: true };
    case 'definition':
      return card.definition ? null : { ...card, definition: true };
    case 'first':
      return card.revealed.includes(0) ? null : { ...card, revealed: [...card.revealed, 0] };
    case 'extra': {
      // needs the first letter first; then always the lowest hidden position (deterministic, never repeats)
      if (!card.revealed.includes(0)) return null;
      const next = nextExtraPosition(card, word);
      return next === null ? null : { ...card, revealed: [...card.revealed, next] };
    }
  }
}

export function nextExtraPosition(card: CardHint, word: string): number | null {
  for (let i = 0; i < word.length; i++) if (!card.revealed.includes(i)) return i;
  return null;
}

export const isFullyRevealed = (card: CardHint, word: string) => card.revealed.length >= word.length;

/** e.g. "B I _ _" -> ['B','I',null,null] */
export function maskedWord(word: string, card: CardHint): (string | null)[] {
  return word.split('').map((ch, i) => (card.revealed.includes(i) ? ch : null));
}

export function canApply(card: CardHint, kind: HintKind, word: string): boolean {
  return applyHint(card, kind, word) !== null;
}
