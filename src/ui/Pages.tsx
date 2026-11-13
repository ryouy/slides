import type { ReactNode } from 'react';
import { go } from '../nav';
import { jstDateKey } from '../core/generator';
import { useSave } from '../storage/SaveContext';
import { currentDailyStreak, formatTime, maxDailyStreak } from '../storage/stats';
import type { ThemePref } from '../storage/storage';
import { Footer } from './Home';

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="screen page">
      <header className="topbar">
        <button className="icon-btn" onClick={() => go('')} aria-label="Back">←</button>
        <h1>{title}</h1>
        <div className="top-right" />
      </header>
      <div className="prose">{children}</div>
      <Footer />
    </div>
  );
}

const Ex = ({ cells }: { cells: [string, 'green' | 'yellow' | 'gray' | ''][] }) => (
  <div className="example">
    {cells.map(([l, m], i) => (
      <span key={i} className={`mc big${m ? ` m-${m}` : ''}`}>{l}</span>
    ))}
  </div>
);

export function HowToPage() {
  return (
    <Page title="HOW TO PLAY">
      <p>Fifteen letter tiles and one blank sit on a 4×4 board. Slide tiles into the blank (up, down, left or right) to build <b>four hidden English words</b>:</p>
      <ul>
        <li>The top three rows each hold a <b>4-letter word</b>, in <b>any order</b>.</li>
        <li>The bottom row holds a <b>3-letter word</b> in its left three cells, with the blank at the bottom right.</li>
      </ul>
      <pre className="goal">{'B I R D\nF I S H\nT R E E\nC A T □'}</pre>
      <p>You don't know the words in advance. Press <b>CHECK</b> any time to colour the tiles:</p>
      <Ex cells={[['B', 'green'], ['R', 'yellow'], ['A', 'gray'], ['D', 'green']]} />
      <ul>
        <li><b className="t-green">Green</b>: right letter, right position.</li>
        <li><b className="t-yellow">Yellow</b>: the word has this letter, but elsewhere.</li>
        <li><b className="t-gray">Gray</b>: not in the word (or you have more than it needs).</li>
      </ul>
      <h3>Good to know</h3>
      <ul>
        <li>Because row order is free, CHECK compares each row with the hidden word it matches best (most greens, then most yellows). <b>That match can change between CHECKs</b>, so a letter that was green before may not be green next time.</li>
        <li>Colours disappear when you move a tile. Your past CHECKs stay in the hint history.</li>
        <li><b>WORDS FOUND</b> shows how many words are on the board <i>right now</i>. Break one and the count drops. It needs no CHECK.</li>
        <li>The puzzle clears automatically at 4/4 with the blank at the bottom right. There is no CHECK limit.</li>
      </ul>
      <h3>Controls</h3>
      <ul>
        <li>Tap/click a tile next to the blank, or</li>
        <li>swipe on the board / press arrow keys: the tile moves in that direction.</li>
      </ul>
      <h3>Modes</h3>
      <p><b>Daily</b>: the same puzzle for everyone, new every day at 0:00 Japan time. <b>Endless</b>: random puzzles at Easy, Normal or Hard.</p>
    </Page>
  );
}

export function StatsPage() {
  const { data } = useSave();
  const today = jstDateKey();
  const bestRow = (d: 'easy' | 'normal' | 'hard') => {
    const b = data.bests[d];
    return b.timeMs === undefined ? '–' : `${formatTime(b.timeMs)} / ${b.moves} moves`;
  };
  return (
    <Page title="STATISTICS">
      <div className="stat-grid">
        <Big n={data.completed} l="COMPLETED" />
        <Big n={currentDailyStreak(data.dailyHistory, today)} l="DAILY STREAK" />
        <Big n={maxDailyStreak(data.dailyHistory)} l="BEST DAILY STREAK" />
        <Big n={data.endlessStreak} l="ENDLESS STREAK" />
      </div>
      <h3>Endless personal bests (time / fewest moves)</h3>
      <table className="table">
        <tbody>
          <tr><th>Easy</th><td>{bestRow('easy')}</td></tr>
          <tr><th>Normal</th><td>{bestRow('normal')}</td></tr>
          <tr><th>Hard</th><td>{bestRow('hard')}</td></tr>
        </tbody>
      </table>
      <h3>Recent games</h3>
      {data.history.length === 0 ? <p>No games yet.</p> : (
        <table className="table">
          <tbody>
            {data.history.slice(-8).reverse().map((h, i) => (
              <tr key={i}>
                <th>{h.date.slice(5)} {h.mode === 'daily' ? 'Daily' : h.difficulty}</th>
                <td>{formatTime(h.timeMs)} · {h.moves}m · {h.checks}c</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Page>
  );
}

const Big = ({ n, l }: { n: number; l: string }) => (
  <div className="big-stat"><b>{n}</b><span>{l}</span></div>
);

export function SettingsPage() {
  const { data, update } = useSave();
  const s = data.settings;
  const set = (p: Partial<typeof s>) => update((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  return (
    <Page title="SETTINGS">
      <label className="field">
        Theme
        <select value={s.theme} onChange={(e) => set({ theme: e.target.value as ThemePref })}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label className="field check">
        <input type="checkbox" checked={s.colorblind} onChange={(e) => set({ colorblind: e.target.checked })} />
        Colour-blind mode (orange/blue + symbols)
      </label>
      <label className="field check">
        <input type="checkbox" checked={s.adConsent === true} onChange={(e) => set({ adConsent: e.target.checked })} />
        Allow ad cookies (only used if ads are enabled)
      </label>
      <button
        className="btn"
        onClick={() => {
          if (confirm('Delete all saved progress and statistics on this device?')) {
            try { localStorage.clear(); } catch { /* ignore */ }
            location.reload();
          }
        }}
      >
        Reset all data
      </button>
    </Page>
  );
}

export function AboutPage() {
  return (
    <Page title="ABOUT">
      <p>WORD SLIDE combines the classic 15-puzzle with Wordle-style deduction. It is free to play, needs no account, and stores your progress only in your browser.</p>
      <p>A new Daily Puzzle appears every day at 0:00 Japan Standard Time, and Endless Mode offers as many random puzzles as you like.</p>
    </Page>
  );
}

export function PrivacyPage() {
  return (
    <Page title="PRIVACY POLICY">
      <p><b>What we store.</b> Your settings, statistics and in-progress games are saved in your browser's localStorage. This data never leaves your device.</p>
      <p><b>Accounts.</b> There are no accounts and we do not collect personal information.</p>
      <p><b>Advertising.</b> This site may show ads from third-party providers such as Google AdSense. These providers may use cookies to serve and measure ads. Ads are loaded only after you accept ad cookies (Settings → Allow ad cookies), where required. You can withdraw consent at any time in Settings, and manage ad personalisation in your Google account settings.</p>
      <p><b>Changes.</b> This policy may be updated; the current version is always on this page.</p>
      <p className="muted">Template text: the site operator must review and complete this policy (operator name, contact, regional requirements) before publishing with live ads.</p>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Page title="TERMS OF USE">
      <p>WORD SLIDE is provided "as is", without warranty. Use it at your own risk. We may change or discontinue the game at any time. Do not attempt to disrupt the service.</p>
      <p className="muted">Template text: review before publishing.</p>
    </Page>
  );
}

export function ContactPage() {
  return (
    <Page title="CONTACT">
      <p>Questions, bug reports or word suggestions are welcome.</p>
      <p className="muted">Contact: <b>set your contact e-mail or form URL here before publishing</b> (src/ui/Pages.tsx).</p>
    </Page>
  );
}
