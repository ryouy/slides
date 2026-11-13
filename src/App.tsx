import { useEffect, useState } from 'react';
import { SaveProvider, useSave } from './storage/SaveContext';
import { ConsentBanner } from './ads/AdSlot';
import { DailyScreen, EndlessScreen } from './ui/Screens';
import { Home } from './ui/Home';
import { AboutPage, ContactPage, HowToPage, PrivacyPage, SettingsPage, StatsPage, TermsPage } from './ui/Pages';

function useRoute(): string {
  const get = () => location.hash.replace(/^#\/?/, '') || '';
  const [r, setR] = useState(get);
  useEffect(() => {
    const h = () => setR(get());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return r;
}

function Shell() {
  const route = useRoute();
  const { data } = useSave();

  useEffect(() => {
    const el = document.documentElement;
    if (data.settings.theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', data.settings.theme);
    el.classList.toggle('cb', data.settings.colorblind);
  }, [data.settings.theme, data.settings.colorblind]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  let page;
  switch (route) {
    case 'daily': page = <DailyScreen />; break;
    case 'endless': page = <EndlessScreen />; break;
    case 'how': page = <HowToPage />; break;
    case 'stats': page = <StatsPage />; break;
    case 'settings': page = <SettingsPage />; break;
    case 'about': page = <AboutPage />; break;
    case 'privacy': page = <PrivacyPage />; break;
    case 'contact': page = <ContactPage />; break;
    case 'terms': page = <TermsPage />; break;
    default: page = <Home />;
  }
  return (
    <>
      {page}
      <ConsentBanner />
    </>
  );
}

export function App() {
  return (
    <SaveProvider>
      <Shell />
    </SaveProvider>
  );
}
