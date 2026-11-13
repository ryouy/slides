import { useSyncExternalStore } from 'react';

/** Tiny History-API router: paths like /word-slide/daily, /big-slide, /settings. */
const EVENT = 'app:navigate';

export function navigate(path: string, replace = false) {
  if (path === location.pathname) return;
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(EVENT, cb);
  };
}

export const usePath = (): string => useSyncExternalStore(subscribe, () => location.pathname);

export type GameId = 'word-slide' | 'big-slide' | 'art-slide';
export const GAMES: { id: GameId; label: string }[] = [
  { id: 'word-slide', label: 'WORD SLIDE' },
  { id: 'big-slide', label: 'BIG SLIDE' },
  { id: 'art-slide', label: 'ART SLIDE' },
];

/** Pages shared by both games (not under a game prefix). */
export const SHARED = ['settings', 'about', 'privacy', 'terms', 'contact'];

export function parsePath(path: string): { game: GameId | null; sub: string } {
  const [first, ...rest] = path.replace(/^\/+|\/+$/g, '').split('/');
  if (first === 'word-slide' || first === 'big-slide' || first === 'art-slide') return { game: first, sub: rest.join('/') };
  return { game: null, sub: first ?? '' };
}

let lastGame: GameId = 'word-slide';
export function currentGame(): GameId {
  const { game } = parsePath(location.pathname);
  if (game) lastGame = game;
  return lastGame;
}

/** Navigate relative to the current game ('' = game home); shared pages live at the site root. */
export function go(to: string) {
  if (SHARED.includes(to)) navigate(`/${to}`);
  else navigate(to ? `/${currentGame()}/${to}` : `/${currentGame()}`);
}

/** Old hash URLs (#/daily) keep working: /#/daily -> /word-slide/daily. */
export function migrateLegacyHash() {
  const m = location.hash.match(/^#\/?(.*)$/);
  if (!m || (location.pathname !== '/' && location.pathname !== '')) return;
  const sub = m[1];
  const target = SHARED.includes(sub) ? `/${sub}` : sub ? `/word-slide/${sub}` : '/word-slide';
  history.replaceState(null, '', target);
}
