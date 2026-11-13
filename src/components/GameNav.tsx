import { GAMES, type GameId } from '../router';
import { Link } from './Link';

/** Top-left link back to the game chooser. Shown on each game's home page. */
export function AllGamesLink() {
  return (
    <Link to="/" className="all-games" data-testid="all-games">
      <span aria-hidden="true">‹</span> ALL GAMES
    </Link>
  );
}

/** Links to the other games, shown at the bottom of each game's home page. */
export function MoreGames({ current }: { current: GameId }) {
  return (
    <nav className="more-games" aria-label="Other games">
      <span className="more-label">MORE GAMES</span>
      <div className="more-row">
        {GAMES.filter((g) => g.id !== current).map((g) => (
          <Link key={g.id} to={`/${g.id}`} className="more-chip" data-testid={`more-${g.id}`}>
            {g.label} <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
