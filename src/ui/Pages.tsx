import { BackButton } from '../components/Icons';
import type { ReactNode } from 'react';
import { go } from '../nav';
import { jstDateKey } from '../core/generator';
import { useSave } from '../storage/SaveContext';
import { currentDailyStreak, formatTime, maxDailyStreak } from '../storage/stats';
import type { ThemePref } from '../storage/storage';
import { Footer } from './Home';
import { LANGS, useLang, useT, type Lang } from '../i18n';
import { adsEnabled } from '../ads/admax';
import { useAdConsent } from '../ads/consent';
import { adsForcedLive } from '../components/AdBanner';

export function Page({ title, children, showFooter = true }: { title: string; children: ReactNode; showFooter?: boolean }) {
  const t = useT();
  return (
    <div className="screen page">
      <header className="topbar">
        <BackButton onClick={() => go('')} label={t('common.back')} />
        <h1>{title}</h1>
        <div className="top-right" />
      </header>
      <div className="prose">{children}</div>
      {showFooter && <Footer />}
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
  const t = useT();
  return (
    <Page title={t('home.howTo')}>
      <p>{t('wordHow.intro')}</p>
      <ul>
        <li>{t('wordHow.layout1')}</li>
        <li>{t('wordHow.layout2')}</li>
      </ul>
      <pre className="goal">{'B I R D\nF I S H\nT R E E\nC A T □'}</pre>
      <h3>{t('wordHow.hintsTitle')}</h3>
      <p>{t('wordHow.hints')}</p>
      <ul>
        <li>{t('wordHow.order')}</li>
        <li>{t('wordHow.difficulty')}</li>
        <li>{t('wordHow.cards')}</li>
      </ul>
      <h3>{t('word.check')}</h3>
      <p>{t('wordHow.check')}</p>
      <Ex cells={[['B', 'green'], ['R', 'yellow'], ['A', 'gray'], ['D', 'green']]} />
      <ul>
        <li>{t('wordHow.green')}</li>
        <li>{t('wordHow.yellow')}</li>
        <li>{t('wordHow.gray')}</li>
        <li>{t('wordHow.checkNotes')}</li>
      </ul>
      <h3>{t('wordHow.tipsTitle')}</h3>
      <p>{t('wordHow.tips')}</p>
      <p>{t('wordHow.noHints')}</p>
      <h3>{t('help.controls')}</h3>
      <p>{t('wordHow.controls')}</p>
      <h3>{t('help.modes')}</h3>
      <p>{t('wordHow.modes')}</p>
    </Page>
  );
}

export function StatsPage() {
  const { data } = useSave();
  const today = jstDateKey();
  const t = useT();
  const bestRow = (d: 'easy' | 'normal' | 'hard') => {
    const b = data.bests[d];
    return b.timeMs === undefined ? t('stats.none') : `${formatTime(b.timeMs)} / ${t('stats.moves', { n: b.moves ?? 0 })}`;
  };
  return (
    <Page title={t('stats.title')}>
      <div className="stat-grid">
        <Big n={data.completed} l={t('stats.completed')} />
        <Big n={currentDailyStreak(data.dailyHistory, today)} l={t('stats.streak')} />
        <Big n={maxDailyStreak(data.dailyHistory)} l={t('stats.bestStreak')} />
        <Big n={data.endlessStreak} l={t('stats.endlessStreak')} />
        <Big n={data.noHintClears} l={t('stats.noHintClears')} />
      </div>
      <h3>{t('stats.endlessBests')}</h3>
      <table className="table">
        <tbody>
          <tr><th>{t('diff.easy')}</th><td>{bestRow('easy')}</td></tr>
          <tr><th>{t('diff.normal')}</th><td>{bestRow('normal')}</td></tr>
          <tr><th>{t('diff.hard')}</th><td>{bestRow('hard')}</td></tr>
        </tbody>
      </table>
      <h3>{t('stats.recent')}</h3>
      {data.history.length === 0 ? <p>{t('stats.noGames')}</p> : (
        <table className="table">
          <tbody>
            {data.history.slice(-8).reverse().map((h, i) => (
              <tr key={i}>
                <th>{h.date.slice(5)} {h.mode === 'daily' ? t('home.dailyShort') : t(`diff.${h.difficulty}`)}</th>
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
    <Page title={t('settings.title')} showFooter={false}>
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
  const t = useT();
  return (
    <Page title={t('common.privacy')}>
      <p>{t('privacy.storage')}</p>
      <p>{t('privacy.accounts')}</p>
      <p>{t('privacy.ads')}</p>
      <p>{t('privacy.choice')}</p>
      <p>{t('privacy.admax')}</p>
      <p>{t('privacy.changes')}</p>
      <p className="muted">{t('privacy.operatorNote')}</p>
    </Page>
  );
}

export function TermsPage() {
  const t = useT();
  return (
    <Page title={t('common.terms')}>
      <p>{t('legal.terms')}</p>
      <p className="muted">{t('legal.termsNote')}</p>
    </Page>
  );
}

export function ContactPage() {
  const t = useT();
  return (
    <Page title={t('common.contact')}>
      <p>{t('legal.contact')}</p>
      <p className="muted">{t('legal.contactNote')}</p>
    </Page>
  );
}
