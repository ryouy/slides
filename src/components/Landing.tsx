import { Link } from './Link';
import { Footer } from '../ui/Home';

export function Landing() {
  return (
    <div className="screen home">
      <p className="tagline">Two sliding puzzles. Pick one.</p>
      <div className="cards">
        <Link to="/word-slide" className="card" data-testid="landing-word">
          <strong>WORD SLIDE</strong>
          <span>Slide 15 letter tiles into four hidden words. Wordle-style hints.</span>
        </Link>
        <Link to="/big-slide" className="card" data-testid="landing-big">
          <strong>BIG SLIDE</strong>
          <span>Numbers and a giant 2×2 tile. Open the right gaps to slide it home.</span>
        </Link>
      </div>
      <Footer />
    </div>
  );
}
