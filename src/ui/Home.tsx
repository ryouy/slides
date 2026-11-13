import { go } from '../nav';
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
        <button className="btn big" onClick={() => go('how')}>How to Play</button>
        <button className="btn big" onClick={() => go('stats')}>Statistics</button>
        <button className="btn big" onClick={() => go('settings')}>Settings</button>
      </nav>
      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <a href="#/about">About</a>
      <a href="#/privacy">Privacy</a>
      <a href="#/terms">Terms</a>
      <a href="#/contact">Contact</a>
    </footer>
  );
}
