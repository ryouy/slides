import { BackButton } from '../components/Icons';
import type { ReactNode } from 'react';
import { go } from '../nav';
import { jstDateKey } from '../core/generator';
import { useSave } from '../storage/SaveContext';
import { currentDailyStreak, formatTime, maxDailyStreak } from '../storage/stats';
import type { ThemePref } from '../storage/storage';
import { Footer } from './Home';
import { LANGS, useLang, useT, type Lang } from '../i18n';
import { adsEnabled } from '../ads/adsterra';
import { useAdConsent } from '../ads/consent';
import { adsForcedLive } from '../components/AdBanner';

export function Page({ title, children }: { title: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="screen page">
      <header className="topbar">
        <BackButton onClick={() => go('')} label={t('common.back')} />
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
      <p>You don't know the words in advance, but the <b>WORD CLUES</b> cards under the board describe them. Each card shows the word length, a category, a meaning and letter slots. Tap the buttons on a card to reveal more (they are recorded as hints):</p>
      <ul>
        <li><b>Category</b> → <b>Meaning</b> → <b>1st letter</b> → <b>+ Letter</b> (one more letter each time).</li>
        <li>Easy shows category and meaning from the start; Normal shows the category; Hard shows nothing.</li>
        <li>The card numbers are <b>not</b> row numbers: the three 4-letter words can be built in any row order. Only the 3-letter word (WORD 4) belongs in the bottom row.</li>
      </ul>
      <h3>CHECK</h3>
      <p>Pick a <b>row</b> (1-4) and a <b>word card</b>, then press CHECK. The row is compared with that word, Wordle style:</p>
      <Ex cells={[['B', 'green'], ['R', 'yellow'], ['A', 'gray'], ['D', 'green']]} />
      <ul>
        <li><b className="t-green">Green</b>: the word has this letter in this position.</li>
        <li><b className="t-yellow">Yellow</b>: the word has this letter, but elsewhere.</li>
        <li><b className="t-gray">Gray</b>: not in the word (or you have more of it than the word needs).</li>
        <li>Green is about <i>that word</i>, not about where the row must finally be placed.</li>
        <li>Rows 1-3 pair with the 4-letter cards; row 4 (left 3 cells) pairs with the 3-letter card.</li>
        <li>Colours disappear when you move a tile; your CHECKs stay in the hint history.</li>
      </ul>
      <h3>Good to know</h3>
      <ul>
        <li><b>WORDS FOUND</b> shows how many words are on the board <i>right now</i> (completed rows get a green outline and their card is ticked). Break one and the count drops. No CHECK needed.</li>
        <li>The puzzle clears automatically at 4/4 with the blank at the bottom right.</li>
        <li>Clear without any CHECK or hint to earn <b>NO HINT CLEAR</b>.</li>
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
        <Big n={data.noHintClears} l="NO HINT CLEARS" />
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
                <td>{formatTime(h.timeMs)} · {h.moves}m · {h.checks}c · {h.hints ?? 0}h{h.noHint ? ' ✨' : ''}</td>
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
  const t = useT();
  const lang = useLang();
  const { data, update } = useSave();
  const s = data.settings;
  const ad = useAdConsent();
  const adsPossible = adsEnabled() || adsForcedLive() || import.meta.env.DEV;
  const set = (p: Partial<typeof s>) => update((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const themes: { id: ThemePref; label: string }[] = [
    { id: 'system', label: t('settings.system') },
    { id: 'light', label: t('settings.light') },
    { id: 'dark', label: t('settings.dark') },
  ];
  return (
    <Page title={t('settings.title')}>
      <div className="set-list">
        <label className="set-row">
          <span className="set-label">{t('settings.language')}</span>
          <span className="select-wrap">
            <select className="select" value={lang} data-testid="lang-select" onChange={(e) => set({ lang: e.target.value as Lang })}>
              {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </span>
        </label>
        <div className="set-row">
          <span className="set-label">{t('settings.theme')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('settings.theme')} data-testid="theme-select">
            {themes.map((th) => (
              <button key={th.id} role="radio" aria-checked={s.theme === th.id} className={`segmented-btn${s.theme === th.id ? ' on' : ''}`} data-testid={`theme-${th.id}`} onClick={() => set({ theme: th.id })}>
                {th.label}
              </button>
            ))}
          </div>
        </div>
        <label className="set-row">
          <span className="set-label">{t('settings.colorblind')}</span>
          <input className="switch-input" type="checkbox" role="switch" checked={s.colorblind} onChange={(e) => set({ colorblind: e.target.checked })} />
        </label>
        {adsPossible && (
          <label className="set-row">
            <span className="set-label">{t('settings.adCookies')}</span>
            <input className="switch-input" type="checkbox" role="switch" data-testid="ad-cookies" checked={ad.allowed} onChange={(e) => ad.set(e.target.checked)} />
          </label>
        )}
      </div>
      <button
        className="reset-link"
        onClick={() => {
          if (confirm(t('settings.resetConfirm'))) {
            try { localStorage.clear(); } catch { /* ignore */ }
            location.reload();
          }
        }}
      >
        {t('settings.reset')}
      </button>
    </Page>
  );
}

export function AboutPage() {
  const t = useT();
  return (
    <Page title={t('about.title')}>
      <p>{t('about.text')}</p>
    </Page>
  );
}

export function PrivacyPage() {
  return (
    <Page title="PRIVACY POLICY">
      <p><b>What we store.</b> Your settings, language, statistics and in-progress games are saved in your browser's localStorage. This data stays on your device.</p>
      <p><b>Accounts.</b> There are no accounts and we do not collect personal information ourselves.</p>
      <p><b>Advertising.</b> This site shows banner ads from the third-party ad network Adsterra. Ad networks may use cookies, device identifiers and your IP address to deliver, limit and measure ads and to show ads that match your interests. We do not give them any information from your games. Each ad runs in its own isolated frame and cannot read this site's content or your saved data.</p>
      <p><b>Your choice.</b> If you are in the EU, the EEA, the UK or Switzerland (or we cannot tell where you are), ads are shown only after you accept ad cookies. Elsewhere ads are shown until you turn them off. You can change your choice at any time in Settings → "Allow ad cookies". Turning them off stops ads from loading. You can also use your browser's cookie controls or an ad blocker; the games work the same without ads. For California residents and others with opt-out rights: turning off ad cookies in Settings is our opt-out.</p>
      <p><b>Adsterra.</b> How Adsterra processes data is described in its own privacy policy (https://adsterra.com/privacy-policy/).</p>
      <p><b>Changes.</b> This policy may be updated; the current version is always on this page.</p>
      <p className="muted">Operator note: add your name and contact details here before publishing, and keep this text in line with the ad network's current requirements.</p>
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
