import type { Dims } from './board';

/**
 * Region of the WHOLE image (fractions 0..1) that belongs to the tile whose home is (row, col).
 * The board has the painting's own proportions, so the tiles together cover it exactly: no cropping.
 */
export function tileRegion(d: Dims, row: number, col: number) {
  return { x0: col / d.cols, x1: (col + 1) / d.cols, y0: row / d.rows, y1: (row + 1) / d.rows };
}

/**
 * CSS background settings that show exactly that region inside a tile-sized box.
 * One image is shared by all tiles; only `position` differs, so tiles join up seamlessly.
 */
export function tileBackground(d: Dims, row: number, col: number) {
  const px = d.cols > 1 ? (col / (d.cols - 1)) * 100 : 0;
  const py = d.rows > 1 ? (row / (d.rows - 1)) * 100 : 0;
  return { size: `${d.cols * 100}% ${d.rows * 100}%`, position: `${px}% ${py}%`, px, py, W: d.cols, H: d.rows };
}
