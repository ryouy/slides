import { useEffect } from 'react';
import { ConsentBanner } from './ads/AdSlot';
import { BigDaily, BigEndless, BigHome, BigHowPage, BigStatsPage } from './games/big-slide/pages/BigPages';
import { BigSaveProvider } from './games/big-slide/storage';
import { ArtCreditsPage, ArtDaily, ArtGallery, ArtHome, ArtHowPage, ArtPlay, ArtStatsPage } from './games/art-slide/pages/ArtPages';
import { ArtSaveProvider } from './games/art-slide/storage';
import { parsePath, usePath } from './router';
import { SaveProvider, useSave } from './storage/SaveContext';
import { Home } from './ui/Home';
import { AboutPage, ContactPage, HowToPage, PrivacyPage, SettingsPage, StatsPage, TermsPage } from './ui/Pages';
import { DailyScreen, EndlessScreen } from './ui/Screens';

const TITLES = { 'word-slide': 'WORD SLIDE – slide puzzle meets Wordle', 'big-slide': 'BIG SLIDE – slide the giant tile', 'art-slide': 'ART SLIDE – reassemble a masterpiece' };
const SITE_TITLE = 'ART SLIDE – reassemble a masterpiece';

function WordRoutes({ sub }: { sub: string }) {
  switch (sub) {
    case 'daily': return <DailyScreen />;
    case 'endless': return <EndlessScreen />;
    case 'how': return <HowToPage />;
    case 'stats': return <StatsPage />;
    default: return <Home />;
  }
}

function BigRoutes({ sub }: { sub: string }) {
  return (
    <BigSaveProvider>
      {sub === 'daily' ? <BigDaily /> : sub === 'endless' ? <BigEndless /> : sub === 'how' ? <BigHowPage /> : sub === 'stats' ? <BigStatsPage /> : <BigHome />}
    </BigSaveProvider>
  );
}

function ArtRoutes({ sub }: { sub: string }) {
  const [head, id] = sub.split('/');
  return (
    <ArtSaveProvider>
      <div className="art-theme">
      {head === 'daily' ? <ArtDaily /> : head === 'gallery' ? <ArtGallery /> : head === 'play' ? <ArtPlay key={id ?? ''} artworkId={id} /> : head === 'how' ? <ArtHowPage /> : head === 'stats' ? <ArtStatsPage /> : head === 'credits' ? <ArtCreditsPage /> : <ArtHome />}
      </div>
    </ArtSaveProvider>
  );
}

function Shell() {
  const path = usePath();
  const { game, sub } = parsePath(path);
  const { data } = useSave();

  useEffect(() => {
    const el = document.documentElement;
    if (data.settings.theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', data.settings.theme);
    el.classList.toggle('cb', data.settings.colorblind);
  }, [data.settings.theme, data.settings.colorblind]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = game ? TITLES[game] : SITE_TITLE;
  }, [path, game]);

  let page;
  if (game === 'word-slide') page = <WordRoutes sub={sub} />;
  else if (game === 'big-slide') page = <BigRoutes sub={sub} />;
  else if (game === 'art-slide') page = <ArtRoutes sub={sub} />;
  else
    switch (sub) {
      case 'settings': page = <SettingsPage />; break;
      case 'about': page = <AboutPage />; break;
      case 'privacy': page = <PrivacyPage />; break;
      case 'terms': page = <TermsPage />; break;
      case 'contact': page = <ContactPage />; break;
      default: page = <ArtRoutes sub="" />; // the main page is ART SLIDE
    }
  // pages glide in (from the right going forward, from the left going back); the key is the page, not the artwork id
  const pageKey = `${game ?? ''}/${sub.split('/')[0]}`;
  return (
    <>
      <div key={pageKey} className="page-enter">
        {page}
      </div>
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
