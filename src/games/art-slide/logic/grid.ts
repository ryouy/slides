import type { ArtLevel, Dims } from './board';

/**
 * Picks the number of columns and rows for a painting of the given aspect ratio (width / height).
 * The board is as proportioned as the painting, so every tile shows its own part of the picture and
 * nothing is cropped. Tiles stay close to square, and the piece count stays close to level² while still
 * growing from level to level.
 */
export function gridFor(aspect: number, level: ArtLevel): Dims {
  const target = level * level;
  // every level has strictly more pieces than the easier one, so the levels always feel different
  const floor = level > 3 ? (() => { const e = gridFor(aspect, (level - 1) as ArtLevel); return e.cols * e.rows; })() : 0;
  let best: Dims = { cols: level, rows: level };
  let bestCost = Infinity;
  for (let cols = 2; cols <= 12; cols++) {
    for (let rows = 2; rows <= 12; rows++) {
      const count = cols * rows;
      if (count < 6 || count <= floor) continue;
      const tileAspect = (aspect * rows) / cols; // 1 = square tile
      const cost = Math.abs(Math.log(tileAspect)) * 6 + Math.abs(Math.log(count / target)) * 1.5;
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = { cols, rows };
      }
    }
  }
  return best;
}

export const aspectOf = (a: { width: number; height: number }) => a.width / a.height;
