import { go } from '../nav';
import { Link } from '../components/Link';
import { BackToMain } from '../components/GameNav';
import { HomeLinks } from '../components/HomeLinks';
import { dailyNumber, jstDateKey } from '../core/generator';
import { useSave } from '../storage/SaveContext';
import { currentDailyStreak } from '../storage/stats';

export function Home() {
  const { data } = useSave();
  const today = jstDateKey();
  const doneToday = !!data.dailyHistory[today];
  const streak = currentDailyStreak(data.dailyHistory, today);
  return (
    <div className="screen home">
      <BackToMain />
      <div className="logo" aria-label="WORD SLIDE">
        {'WORD'.split('').map((c, i) => <span key={i} className="logo-tile g">{c}</span>)}
        <br />
        {'SLIDE'.split('').map((c, i) => <span key={i} className={`logo-tile ${i % 2 ? 'y' : 'x'}`}>{c}</span>)}
      </div>
      <p className="tagline">Slide the tiles. Read the hints. Find four hidden words.</p>
      <nav className="menu">
        <button className="btn primary big" data-testid="daily" onClick={() => go('daily')}>
          Daily Puzzle #{dailyNumber(today)}
          <small>{doneToday ? '✓ Cleared today' : 'New every day at 0:00 JST'}{streak > 0 ? ` · 🔥 ${streak}` : ''}</small>
        </button>
        <button className="btn big" data-testid="endless" onClick={() => go('endless')}>Endless Mode</button>
      </nav>
      <HomeLinks items={[{ label: 'How to Play', to: 'how' }, { label: 'Statistics', to: 'stats' }, { label: 'Settings', to: 'settings' }]} />
      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <Link to="/about">About</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/terms">Terms</Link>
      <Link to="/contact">Contact</Link>
    </footer>
  );
}
