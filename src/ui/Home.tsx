import { go } from '../nav';
import { Link } from '../components/Link';
import { BackToMain } from '../components/GameNav';
import { HomeLinks } from '../components/HomeLinks';
import { dailyNumber, jstDateKey } from '../core/generator';
import { useT } from '../i18n';
import { useSave } from '../storage/SaveContext';
import { currentDailyStreak } from '../storage/stats';

export function Home() {
  const t = useT();
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
      <nav className="menu">
        <button className="btn primary big" data-testid="daily" onClick={() => go('daily')}>
          {t('home.dailyN', { n: dailyNumber(today) })}{doneToday ? ' ✓' : ''}{streak > 0 ? ` · 🔥 ${streak}` : ''}
        </button>
        <button className="btn big" data-testid="endless" onClick={() => go('endless')}>{t('home.endless')}</button>
      </nav>
      <HomeLinks items={[{ label: t('home.howTo'), to: 'how' }, { label: t('home.stats'), to: 'stats' }, { label: t('home.settings'), to: 'settings' }]} />
      <Footer />
    </div>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="footer">
      <Link to="/about">{t('common.about')}</Link>
      <Link to="/privacy">{t('common.privacy')}</Link>
      <Link to="/terms">{t('common.terms')}</Link>
      <Link to="/contact">{t('common.contact')}</Link>
    </footer>
  );
}
