import { describe, expect, it } from 'vitest';
import { artShareUrl, shareLinks } from './share';

describe('share links', () => {
  it('builds the preview link of a painting (daily adds ?d=1)', () => {
    expect(artShareUrl('van-gogh-bedroom', false)).toMatch(/\/s\/van-gogh-bedroom\/$/);
    expect(artShareUrl('van-gogh-bedroom', true)).toMatch(/\/s\/van-gogh-bedroom\/\?d=1$/);
  });

  it('passes text and link separately to X and LINE, using URL-safe encoding', () => {
    const message = 'I rebuilt “The Bedroom” & more';
    const url = 'https://example.com/s/x/?d=1';
    const links = shareLinks(message, url);

    expect(Object.keys(links).sort()).toEqual(['line', 'x']);
    for (const link of [links.x, links.line]) {
      expect(link).not.toMatch(/[ “”]/);
      const parsed = new URL(link);
      expect(parsed.searchParams.get('url')).toBe(url);
      expect(parsed.searchParams.get('text')).toBe(message);
    }
    expect(new URL(links.x).host).toBe('twitter.com');
    expect(new URL(links.line).host).toBe('social-plugins.line.me');
  });
});
