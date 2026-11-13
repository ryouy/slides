import type { ArtSize } from './board';

export interface Focus {
  x: number;
  y: number;
}

/**
 * The board is a square showing a centre-crop (cover, never stretched) of the artwork.
 * Region of the SOURCE image (fractions 0..1) that belongs to the tile at (row, col):
 */
export function tileRegion(w: number, h: number, n: number, row: number, col: number, focus: Focus = { x: 0.5, y: 0.5 }) {
  const s = Math.min(w, h); // side of the square crop in source pixels
  const ox = (w - s) * clamp01(focus.x);
  const oy = (h - s) * clamp01(focus.y);
  const t = s / n;
  return { x0: (ox + col * t) / w, x1: (ox + (col + 1) * t) / w, y0: (oy + row * t) / h, y1: (oy + (row + 1) * t) / h };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * CSS background settings that show exactly that region inside a tile-sized box.
 * One image is shared by all tiles; only `position` differs, so tiles join up seamlessly.
 */
export function tileBackground(w: number, h: number, n: ArtSize | number, row: number, col: number, focus: Focus = { x: 0.5, y: 0.5 }) {
  const s = Math.min(w, h);
  const k = n / s; // source px -> tile units (1 tile = 1 unit)
  const W = w * k; // scaled image size in tile units
  const H = h * k;
  const ox = (w - s) * clamp01(focus.x) * k;
  const oy = (h - s) * clamp01(focus.y) * k;
  // CSS: offset = (box - image) * p/100  =>  p = (ox + col) / (W - 1)
  const px = ((ox + col) / (W - 1)) * 100;
  const py = ((oy + row) / (H - 1)) * 100;
  return { size: `${W * 100}% ${H * 100}%`, position: `${px}% ${py}%`, px, py, W, H };
}
