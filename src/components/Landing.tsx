import { ARTWORKS, getArtwork } from '../games/art-slide/data';
import { dailyArtworkId } from '../games/art-slide/logic/generator';
import { jstDateKey } from '../utils/date';
import { Footer } from '../ui/Home';
import { Link } from './Link';

/** The game chooser: the only place where games are switched. */
export function Landing() {
  const art = getArtwork(dailyArtworkId(jstDateKey())) ?? ARTWORKS[0];
  return (
    <div className="screen landing">
      <header className="landing-head">
        <h1 className="landing-title">
          <span>SLIDE</span> GAMES
        </h1>
        <p className="tagline">Three sliding puzzles. Pick one to play.</p>
      </header>
      <div className="game-cards">
        <Link to="/word-slide" className="gcard-big word" data-testid="landing-word">
          <div className="gc-visual" aria-hidden="true">
            {[['W', 'g'], ['O', 'y'], ['R', 'x'], ['D', 'g']].map(([c, k]) => (
              <span key={c} className={`logo-tile ${k}`}>{c}</span>
            ))}
          </div>
          <strong>WORD SLIDE</strong>
          <span>Slide 15 letter tiles into four hidden words, with Wordle-style hints.</span>
          <em className="gc-go">PLAY →</em>
        </Link>
        <Link to="/big-slide" className="gcard-big big" data-testid="landing-big">
          <div className="gc-visual" aria-hidden="true">
            <div className="mini-big">
              <b className="mb-block">BIG</b>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <i key={n}>{n}</i>)}
            </div>
          </div>
          <strong>BIG SLIDE</strong>
          <span>Numbers plus giant blocks. Open up the right gaps to slide them home.</span>
          <em className="gc-go">PLAY →</em>
        </Link>
        <Link to="/art-slide" className="gcard-big art" data-testid="landing-art">
          <div className="gc-visual" aria-hidden="true">
            <div className="mini-frame">
              <img src={art.thumbnailUrl} alt="" width={120} height={120} />
            </div>
          </div>
          <strong>ART SLIDE</strong>
          <span>Reassemble a famous painting. A new masterpiece every day.</span>
          <em className="gc-go">PLAY →</em>
        </Link>
      </div>
      <Footer />
    </div>
  );
}
