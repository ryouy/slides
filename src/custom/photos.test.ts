import { describe, expect, it } from 'vitest';
import { detectImageType, fitWithin, limitProblem, MAX_PHOTOS, MAX_TOTAL_BYTES, photoArtworkId, photoIdOf, type PhotoMeta } from './photos';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('picture type is decided by the bytes', () => {
  it('JPEG, PNG and WebP are accepted', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('jpeg');
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png');
    const webp = new Uint8Array(16);
    webp.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    webp.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
    expect(detectImageType(webp)).toBe('webp');
  });
  it('anything else is refused, whatever the file is called', () => {
    expect(detectImageType(bytes())).toBeNull();
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull(); // no SVG (scripts)
    expect(detectImageType(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode('%PDF-1.7 ......'))).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull();
  });
});

describe('sizes and limits', () => {
  it('only ever scales down, keeping the proportions', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1, 5000, 1600)).toEqual({ width: 1, height: 1600 });
  });
  const meta = (n: number, bytes = 100): PhotoMeta[] => Array.from({ length: n }, (_, i) => ({ id: String(i), name: 'p', createdAt: i, width: 1, height: 1, bytes }));
  it('caps the number of photos and the total space', () => {
    expect(limitProblem(meta(MAX_PHOTOS - 1), 10)).toBeNull();
    expect(limitProblem(meta(MAX_PHOTOS), 10)).toBe('limit');
    expect(limitProblem(meta(2, MAX_TOTAL_BYTES / 2), 1)).toBe('quota');
    expect(limitProblem(meta(1, 10), MAX_TOTAL_BYTES)).toBe('quota');
  });
  it('photo ids map to puzzle ids and back', () => {
    expect(photoArtworkId('abc')).toBe('custom:abc');
    expect(photoIdOf('custom:abc')).toBe('abc');
  });
});
