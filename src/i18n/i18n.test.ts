import { describe, expect, it } from 'vitest';
import de from './de';
import en from './en';
import es from './es';
import fr from './fr';
import { LANGS, detectLang, isLang, makeT, translate, type Lang } from './index';
import ja from './ja';
import ko from './ko';
import zh from './zh';

const dicts: Record<Exclude<Lang, 'en'>, Record<string, string>> = { ja, zh, ko, es, fr, de } as never;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

/** Same in every language (brand name, dash, year ranges). */
const NEUTRAL = ['common.toMain', 'stats.none', 'era.1800–1849', 'era.1850–1879', 'era.1880–1899'];

describe('languages', () => {
  it('offers the major languages, each labelled in its own language', () => {
    expect(LANGS.map((l) => l.id)).toEqual(['en', 'ja', 'zh', 'ko', 'es', 'fr', 'de']);
    expect(LANGS.find((l) => l.id === 'ja')!.label).toBe('日本語');
    LANGS.forEach((l) => expect(isLang(l.id)).toBe(true));
  });
  it('every language translates every key (nothing silently falls back to English)', () => {
    const keys = Object.keys(en).filter((k) => !NEUTRAL.includes(k));
    for (const [lang, d] of Object.entries(dicts)) {
      const missing = keys.filter((k) => !(k in d));
      expect(missing, `${lang} is missing keys`).toEqual([]);
      const extra = Object.keys(d).filter((k) => !(k in en));
      expect(extra, `${lang} has unknown keys`).toEqual([]);
    }
  });
  it('keeps the {placeholders} of every string and never leaves a string empty', () => {
    for (const [lang, d] of Object.entries(dicts)) {
      for (const [k, v] of Object.entries(d)) {
        expect(v.trim().length, `${lang}.${k}`).toBeGreaterThan(0);
        expect(placeholders(v), `${lang}.${k}`).toBe(placeholders((en as Record<string, string>)[k]));
      }
    }
  });
  it('actually differs from English for the main UI (it is a real translation)', () => {
    for (const [lang, d] of Object.entries(dicts)) {
      const same = ['art.shuffle', 'art.preview', 'settings.title'].filter((k) => d[k] === (en as Record<string, string>)[k]);
      expect(same, lang).toEqual([]);
    }
  });
});

describe('translate & detect', () => {
  it('fills variables and falls back to English', () => {
    expect(translate('en', 'home.dailyN', { n: 13 })).toBe('Daily Puzzle #13');
    expect(translate('ja', 'home.dailyN', { n: 13 })).toBe('デイリー #13');
    expect(makeT('de')('stats.moves', { n: 7 })).toBe('7 Züge');
    expect(translate('en', 'gal.filtered', { n: 3 })).toBe('3 of {total}'); // unknown variable stays visible
  });
  it('picks the browser language on the first visit, else English', () => {
    expect(detectLang(['ja-JP', 'en-US'])).toBe('ja');
    expect(detectLang(['zh-CN'])).toBe('zh');
    expect(detectLang(['pt-BR', 'fr-CA'])).toBe('fr'); // first language we have
    expect(detectLang(['xx'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });
  it('share messages carry the result and read naturally in each language', () => {
    for (const l of LANGS) {
      const t = makeT(l.id);
      const msg = t('share.artDaily', { title: 'The Bedroom', artist: 'Vincent van Gogh', time: '1:42', moves: 87, n: 13 });
      for (const part of ['The Bedroom', 'Vincent van Gogh', '1:42', '87', '13']) expect(msg, l.id).toContain(part);
      expect(msg).not.toMatch(/\{\w+\}/);
    }
  });
});
