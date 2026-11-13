import { Link } from './Link';

/** Top-left link from BIG SLIDE / WORD SLIDE back to the main page (ART SLIDE). */
export function BackToMain() {
  return (
    <Link to="/" className="all-games" data-testid="to-main">
      <span aria-hidden="true">‹</span> ART SLIDE
    </Link>
  );
}
