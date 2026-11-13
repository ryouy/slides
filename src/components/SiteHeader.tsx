import { GAMES, parsePath, currentGame, usePath } from '../router';
import { Link } from './Link';

/** Site title + game tabs. Shown on every page. */
export function SiteHeader() {
  const path = usePath();
  const { game } = parsePath(path);
  const active = game ?? (path === '/' ? null : currentGame());
  return (
    <header className="site-header">
      <Link to="/" className="site-title">SLIDE GAMES</Link>
      <nav className="game-tabs" aria-label="Games" role="tablist">
        {GAMES.map((g) => (
          <Link key={g.id} to={`/${g.id}`} role="tab" aria-selected={active === g.id} className={`game-tab${active === g.id ? ' on' : ''}`} data-testid={`tab-${g.id}`}>
            {g.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
