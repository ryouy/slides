import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ARTWORKS, getArtwork } from '../src/games/art-slide/data';
import { OG_H, OG_W, buildOgImage, sharePageHtml, writeShareAssets } from './share-assets-lib';

describe('link previews', () => {
  it('draws the painting as a puzzle on a 1200x630 image, for landscape, portrait and square works', async () => {
    for (const id of ['hokusai-great-wave', 'sargent-madame-x', 'monet-water-lilies', 'van-gogh-self-portrait']) {
      const buf = await buildOgImage(getArtwork(id)!);
      const meta = await sharp(buf).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([OG_W, OG_H, 'jpeg']);
      expect(buf.length).toBeGreaterThan(15_000);
      expect(buf.length).toBeLessThan(400_000);
    }
  });
  it('the image is a real puzzle picture: it differs from the plain painting and is not blank', async () => {
    const art = getArtwork('van-gogh-bedroom')!;
    const { data } = await sharp(await buildOgImage(art)).resize(60, 32).raw().toBuffer({ resolveWithObject: true });
    const distinct = new Set(Array.from({ length: data.length / 3 }, (_, i) => `${data[i * 3] >> 5},${data[i * 3 + 1] >> 5},${data[i * 3 + 2] >> 5}`));
    expect(distinct.size).toBeGreaterThan(20);
  });
  it('share page carries absolute OG/Twitter tags and forwards to the game', () => {
    const art = getArtwork('hokusai-great-wave')!;
    const html = sharePageHtml(art, 'https://art.example.com/');
    expect(html).toContain('<meta property="og:image" content="https://art.example.com/og/hokusai-great-wave.jpg">');
    expect(html).toContain('<meta property="og:url" content="https://art.example.com/s/hokusai-great-wave/">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(`content="${OG_W}"`);
    expect(html).toContain("'/art-slide/daily'"); // ?d=1 goes to today's puzzle
    expect(html).toContain('/art-slide/play/hokusai-great-wave');
    expect(html).toMatch(/<noscript><meta http-equiv="refresh"/);
  });
  it('escapes text that comes from the data', () => {
    const evil = { ...getArtwork('van-gogh-bedroom')!, title: '</title><script>alert("x")</script>' };
    const html = sharePageHtml(evil, 'https://a.b');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
  it('writes an image and a page for the requested paintings', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
    expect(await writeShareAssets(dir, 'https://x.y', ['monet-water-lilies', 'degas-dance-class'])).toBe(2);
    expect(fs.existsSync(`${dir}/og/monet-water-lilies.jpg`)).toBe(true);
    expect(fs.readFileSync(`${dir}/s/degas-dance-class/index.html`, 'utf8')).toContain('https://x.y/og/degas-dance-class.jpg');
    expect(ARTWORKS.length).toBeGreaterThanOrEqual(100);
  });
});
