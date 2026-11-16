import { rngFromString, shuffled } from '../../../utils/rng';
import { dailyNumber } from '../../../utils/date';
import { DAILY_POOL_V2, DAILY_POOL_V3 } from '../data/daily-pools';

// Pure (no artwork data, no React): the Worker uses it to know which painting is today's daily.

/**
 * Frozen pool for the daily puzzle. NEVER reorder or remove entries; to add artworks create a new
 * pool version (and keep this one for dates that were already published).
 */
export const DAILY_POOL_V1 = [
  'van-gogh-wheat-field-cypresses', 'hokusai-great-wave', 'monet-water-lilies', 'seurat-grande-jatte',
  'vermeer-water-pitcher', 'van-gogh-bedroom', 'degas-dance-class', 'caillebotte-paris-street',
  'cassatt-childs-bath', 'cezanne-basket-of-apples', 'toulouse-lautrec-moulin-rouge', 'renoir-two-sisters',
  'rembrandt-aristotle-homer', 'gauguin-day-of-the-god', 'monet-stacks-of-wheat', 'sargent-madame-x',
  'van-gogh-self-portrait', 'hokusai-shower-below-the-summit',
] as const;

/** Published date boundaries: never retroactively reorder the old pools. */
export const DAILY_POOL_V2_FROM = '2026-11-14';
export const DAILY_POOL_V3_FROM = '2026-11-15';

/**
 * Today's artwork was originally a metadata-only print with an 89-character
 * Japanese label. Pin a better documented painting without altering history.
 * Older stored daily puzzles are checked against this ID before resuming.
 */
const DAILY_ARTWORK_OVERRIDES: Readonly<Record<string, string>> = {
  '2026-11-14': 'aic-4887', // Claude Monet — Irises
};

/**
 * Daily artwork rotation. Each frozen pool is shuffled deterministically once
 * per cycle, so a work is shown only once in that pool's cycle.
 */
export function dailyArtworkId(dateKey: string): string {
  const override = DAILY_ARTWORK_OVERRIDES[dateKey];
  if (override) return override;
  const v3 = dateKey >= DAILY_POOL_V3_FROM;
  const v2 = dateKey >= DAILY_POOL_V2_FROM;
  const pool: readonly string[] = v3 ? DAILY_POOL_V3 : v2 ? DAILY_POOL_V2 : DAILY_POOL_V1;
  const from = v3 ? DAILY_POOL_V3_FROM : v2 ? DAILY_POOL_V2_FROM : '2026-11-01';
  const idx = dailyNumber(dateKey) - dailyNumber(from);
  const cycle = Math.floor(idx / pool.length);
  const prefix = v3 ? 'v3|' : v2 ? 'v2|' : '';
  const order = shuffled(rngFromString(`art-daily|a1|${prefix}cycle${cycle}`), pool);
  return order[((idx % pool.length) + pool.length) % pool.length];
}

