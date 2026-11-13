import { describe, expect, it } from 'vitest';
import { artShareUrl, shareLinks } from './share';

describe('share links', () => {
  it('builds the preview link of a painting (daily adds ?d=1)', () => {
    expect(artShareUrl('van-gogh-bedroom', false)).toMatch(/\/s\/van-gogh-bedroom\/$/);
    expect(artShareUrl('van-gogh-bedroom', true)).toMatch(/\/s\/van-gogh-bedroom\/\?d=1$/);
  });
  it('passes text and link separately and encodes them', () => {
    const l = shareLinks('I rebuilt “The Bedroom” 🧩 & more', 'https://example.com/s/x/?d=1');
    for (const u of [l.x, l.facebook, l.line]) expect(u).not.toMatch(/[ “”]/);
    expect(l.x).toContain('twitter.com/intent/tweet?text=');
    expect(decodeURIComponent(new URL(l.x).searchParams.get('text')!)).toContain('The Bedroom');
    expect(new URL(l.x).searchParams.get('url')).toBe('https://example.com/s/x/?d=1');
    expect(new URL(l.line).searchParams.get('url')).toBe('https://example.com/s/x/?d=1');
    expect(new URL(l.facebook).searchParams.get('u')).toBe('https://example.com/s/x/?d=1');
  });
});
