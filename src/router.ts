import { useSyncExternalStore } from 'react';

/** Tiny History-API router: paths like /word-slide/daily, /big-slide, /settings. */
const EVENT = 'app:navigate';

/**
 * Position in the session history, so pages can slide in from the right when going forward and from
 * the left when going back. It is exposed as <html data-nav="forward|back"> for CSS.
 */
let navIndex: number = (history.state && typeof history.state.i === 'number' ? history.state.i : 0);
const setDir = (d: 'forward' | 'back') => document.documentElement.setAttribute('data-nav', d);
window.addEventListener('popstate', () => {
  const i = history.state && typeof history.state.i === 'number' ? history.state.i : 0;
  setDir(i < navIndex ? 'back' : 'forward');
  navIndex = i;
});

export function navigate(path: string, replace = false) {
  if (path === location.pathname) return;
  if (replace) history.replaceState({ i: navIndex }, '', path);
  else {
    navIndex += 1;
    history.pushState({ i: navIndex }, '', path);
    setDir('forward');
  }
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

/** Remember which game the player was in, so shared pages (Settings...) can lead back to it. */
let lastGame: GameId = 'art-slide';
function snapshot(): string {
  const { game } = parsePath(location.pathname);
  if (game) lastGame = game;
  return location.pathname;
}

export const usePath = (): string => useSyncExternalStore(subscribe, snapshot);

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

export function currentGame(): GameId {
  if (location.pathname === '/' || location.pathname === '') return 'art-slide'; // the main page is ART SLIDE
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
