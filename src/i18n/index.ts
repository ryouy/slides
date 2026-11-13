import { useCallback } from 'react';
import { useSave } from '../storage/SaveContext';
import de from './de';
import en, { type Dict, type Key } from './en';
import es from './es';
import fr from './fr';
import ja from './ja';
import ko from './ko';
import zh from './zh';

export type { Key } from './en';
export type Lang = 'en' | 'ja' | 'zh' | 'ko' | 'es' | 'fr' | 'de';

/** Labels are written in each language itself, so everyone can find theirs. */
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'zh', label: '中文（简体）' },
  { id: 'ko', label: '한국어' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
];

const dicts: Record<Lang, Partial<Dict>> = { en, ja, zh, ko, es, fr, de };

export const isLang = (x: unknown): x is Lang => LANGS.some((l) => l.id === x);

/** First visit: pick the browser's language if we have it, otherwise English. */
export function detectLang(languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): Lang {
  for (const l of languages) {
    const code = l.toLowerCase().split('-')[0];
    if (isLang(code)) return code;
  }
  return 'en';
}

export type Translate = (key: Key, vars?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const raw = dicts[lang][key] ?? en[key];
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : raw;
}

export const makeT = (lang: Lang): Translate => (key, vars) => translate(lang, key, vars);

/** The language in use: the saved choice, else the browser's. */
export function useLang(): Lang {
  const { data } = useSave();
  return data.settings.lang && isLang(data.settings.lang) ? data.settings.lang : detectLang();
}

export function useT(): Translate {
  const lang = useLang();
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}
