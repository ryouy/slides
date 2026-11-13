import { Link } from './Link';

/** Top-left link back to the game chooser. Shown on each game's home page. */
export function AllGamesLink() {
  return (
    <Link to="/" className="all-games" data-testid="all-games">
      <span aria-hidden="true">‹</span> ALL GAMES
    </Link>
  );
}
