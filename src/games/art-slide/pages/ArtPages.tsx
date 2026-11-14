import { BackButton, ChevronRight } from '../../../components/Icons';
import { useMemo, useState } from 'react';
import { AdSlot } from '../../../ads/AdSlot';
import { HomeLinks } from '../../../components/HomeLinks';
import { Link } from '../../../components/Link';
import { useT, type Key } from '../../../i18n';
import { go } from '../../../router';
import { currentDailyStreak, formatTime, maxDailyStreak } from '../../../storage/stats';
import { dailyNumber, jstDateKey } from '../../../utils/date';
import { Footer } from '../../../ui/Home';
import { Page } from '../../../ui/Pages';
import { ArtGameView } from '../components/ArtGameView';
import { ARTWORKS, getArtwork, nextArtwork, pickRandomArtwork } from '../data';
import { ART_LEVELS, type ArtLevel } from '../logic/board';
import { GROUP_OPTIONS, SORT_OPTIONS, filterArtworks, groupArtworks, type GroupBy, type SortBy } from '../logic/gallery';
import { dailyArtworkId, generateArtDaily, generateArtFree } from '../logic/generator';
import { newArtGame, type ArtState } from '../logic/game';
import { recordArtClear, useArtSave } from '../storage';

export function ArtHome() {
  const t = useT();
  const { data } = useArtSave();
  const today = jstDateKey();
  const streak = currentDailyStreak(data.dailyHistory, today);
  const exhibit = getArtwork(dailyArtworkId(today)) ?? ARTWORKS[0];
  const resumable = data.inProgress.free && data.inProgress.free.status === 'playing';
  const done = !!data.dailyHistory[today];
  return (
    <div className="screen home art-home">
      <div className="art-gallery-heading"><span className="art-gallery-eyebrow">A GALLERY OF PUZZLES</span><h1 className="art-home-title">ART SLIDE</h1><p>Masterpieces, one tile at a time.</p></div>
      <Link to="/art-slide/daily" className="exhibit-card" data-testid="exhibit">
        <img src={exhibit.thumbnailUrl} alt="" width={96} height={96} />
        <span className="ex-text">
          <small>{t('art.exhibitN', { n: dailyNumber(today) })}{done ? ' ✓' : ''}{streak > 0 ? ` · 🔥 ${streak}` : ''}</small>
          <b>{exhibit.title}</b>
          <span>{exhibit.artist}, {exhibit.year}</span>
        </span>
      </Link>
      <nav className="menu">
        <button className="btn big" data-testid="art-gallery" onClick={() => go('gallery')}>{t('art.gallery')}</button>
        <button className="btn big" data-testid="art-random" onClick={() => go(`play/${pickRandomArtwork().id}`)}>{t('art.random')}</button>
        {resumable && <button className="btn big" data-testid="art-resume" onClick={() => go('play')}>{t('art.resume')}</button>}
      </nav>
      <HomeLinks items={[{ label: t('home.howTo'), to: 'how' }, { label: t('home.stats'), to: 'stats' }, { label: t('home.credits'), to: 'credits' }, { label: t('home.settings'), to: 'settings' }]} />
      <section className="other-games" aria-label={t('home.more')}>
        <h2>{t('home.more')}</h2>
        <Link to="/big-slide" className="og-row" data-testid="more-big"><b>BIG SLIDE</b><ChevronRight size={18} className="og-chev" /></Link>
        <Link to="/word-slide" className="og-row" data-testid="more-word"><b>WORD SLIDE</b><ChevronRight size={18} className="og-chev" /></Link>
      </section>
      <Footer />
    </div>
  );
}

const slugId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function ArtGallery() {
  const t = useT();
  const { data, update } = useArtSave();
  const { groupBy, sortBy } = data.gallery;
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterArtworks(ARTWORKS, query), [query]);
  const groups = useMemo(() => groupArtworks(filtered, groupBy, sortBy), [filtered, groupBy, sortBy]);
  const setPrefs = (p: Partial<typeof data.gallery>) => update((d) => ({ ...d, gallery: { ...d.gallery, ...p } }));
  const groupLabel = (label: string) => (groupBy === 'theme' ? t(`theme.${label}` as Key) : groupBy === 'era' ? t(`era.${label}` as Key) : label);
  return (
    <div className="screen gallery-screen">
      <header className="topbar">
        <BackButton onClick={() => go('')} label={t('common.back')} />
        <h1>{t('gal.title')}</h1>
        <div className="top-right" />
      </header>
      <div className="gal-controls">
        <input className="gal-search" data-testid="gal-search" type="search" placeholder={t('gal.search')} aria-label={t('gal.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn gal-random" data-testid="gal-random" onClick={() => go(`play/${pickRandomArtwork().id}`)}>{t('art.random')}</button>
        <label>
          <span>{t('gal.groupBy')}</span>
          <select aria-label={t('gal.groupBy')} data-testid="group-by" value={groupBy} onChange={(e) => setPrefs({ groupBy: e.target.value as GroupBy })}>
            {GROUP_OPTIONS.map((o) => <option key={o.id} value={o.id}>{t(`group.${o.id}` as Key)}</option>)}
          </select>
        </label>
        <label>
          <span>{t('gal.sortBy')}</span>
          <select aria-label={t('gal.sortBy')} data-testid="sort-by" value={sortBy} onChange={(e) => setPrefs({ sortBy: e.target.value as SortBy })}>
            {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{t(`sort.${o.id}` as Key)}</option>)}
          </select>
        </label>
      </div>
      {filtered.length !== ARTWORKS.length && <p className="gal-count" data-testid="gal-count">{t('gal.filtered', { n: filtered.length, total: ARTWORKS.length })}</p>}
      <div data-testid="gallery">
        {groups.length === 0 && <p className="gal-empty">{t('gal.empty', { q: query })}</p>}
        {groups.map((g) => (
          <section key={g.key} className="gal-group" data-testid={`group-${slugId(g.key)}`}>
            {g.label && <h2 className="gal-h">{groupLabel(g.label)} <small>{g.items.length}</small></h2>}
            <ul className="gallery" key={`${groupBy}-${sortBy}`}>
              {g.items.map((a, i) => (
                <li key={a.id} style={{ ['--i' as string]: Math.min(i, 12) }}>
                  <Link to={`/art-slide/play/${a.id}`} className="gcard" data-testid={`art-${a.id}`}>
                    <img src={a.thumbnailUrl} alt={`${a.title} – ${a.artist}`} loading="lazy" decoding="async" width={Math.round(a.width / 4)} height={Math.round(a.height / 4)} />
                    <span className="g-title">{a.title}</span>
                    <span className="g-meta">{a.artist} · {a.year}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <AdSlot />
    </div>
  );
}

function useNumbers() {
  const { data, update } = useArtSave();
  return [data.showNumbers, (v: boolean) => update((d) => ({ ...d, showNumbers: v }))] as const;
}

export function ArtDaily() {
  const { getData, setProgress, update } = useArtSave();
  const [numbers, setNumbers] = useNumbers();
  const [dateKey] = useState(() => jstDateKey());
  const [initial] = useState<ArtState>(() => {
    const saved = getData().inProgress.daily;
    return saved && saved.puzzle.id === `artdaily-${dateKey}` ? saved : newArtGame(generateArtDaily(dateKey));
  });
  const artwork = getArtwork(initial.puzzle.artworkId)!;
  return (
    <ArtGameView
      initial={initial}
      artwork={artwork}
      daily
      showNumbers={numbers}
      onToggleNumbers={setNumbers}
      onBack={() => go('')}
      onProgress={(s) => setProgress('daily', s)}
      onCleared={(s) => update((d) => recordArtClear(d, { state: s, dateKey }))}
      onChangeArtwork={() => go('gallery')}
      onNextArtwork={() => go('gallery')}
    />
  );
}

/** Free play: `/art-slide/play/<artwork id>` starts (or resumes) a puzzle; `/art-slide/play` resumes the saved one. */
export function ArtPlay({ artworkId }: { artworkId?: string }) {
  const t = useT();
  const { getData, setProgress, update } = useArtSave();
  const [numbers, setNumbers] = useNumbers();
  const [game, setGame] = useState<{ key: number; state: ArtState } | null>(() => {
    const saved = getData().inProgress.free;
    if (saved && getArtwork(saved.puzzle.artworkId) && (!artworkId || saved.puzzle.artworkId === artworkId)) return { key: 0, state: saved };
    const art = artworkId ? getArtwork(artworkId) : undefined;
    if (!art) return null;
    const state = newArtGame(generateArtFree(art.id, getData().lastSize));
    setProgress('free', state);
    return { key: 0, state };
  });

  if (!game) {
    return (
      <div className="screen">
        <header className="topbar">
          <BackButton onClick={() => go('')} label={t('common.back')} />
          <h1>ART SLIDE</h1>
          <div className="top-right" />
        </header>
        <button className="btn primary wide" onClick={() => go('gallery')}>{t('art.gallery')}</button>
      </div>
    );
  }

  const art = getArtwork(game.state.puzzle.artworkId)!;
  const start = (artId: string, level: ArtLevel) => {
    update((d) => ({ ...d, lastSize: level }));
    const state = newArtGame(generateArtFree(artId, level));
    setProgress('free', state);
    setGame((g) => ({ key: (g?.key ?? 0) + 1, state }));
    if (artId !== art.id) history.replaceState(history.state, '', `/art-slide/play/${artId}`);
  };
  const level = game.state.puzzle.size;
  return (
    <ArtGameView
      key={game.key}
      initial={game.state}
      artwork={art}
      daily={false}
      showNumbers={numbers}
      onToggleNumbers={setNumbers}
      onBack={() => go('')}
      onProgress={(s) => setProgress('free', s)}
      onCleared={(s) => update((d) => recordArtClear(d, { state: s, dateKey: jstDateKey() }))}
      onLevel={(l) => start(art.id, l)}
      onChangeArtwork={() => go('gallery')}
      onNextArtwork={() => start(nextArtwork(art.id).id, level)}
    />
  );
}

export function ArtHowPage() {
  const t = useT();
  return (
    <Page title={t('how.title')}>
      <ul>
        <li>{t('how.art1')}</li>
        <li>{t('how.art2')}</li>
        <li>{t('how.art3')}</li>
        <li>{t('how.art4')}</li>
      </ul>
    </Page>
  );
}

export function ArtStatsPage() {
  const t = useT();
  const { data } = useArtSave();
  const today = jstDateKey();
  return (
    <Page title={t('stats.title')}>
      <div className="stat-grid">
        <Big n={data.completed} l={t('stats.completed')} />
        <Big n={currentDailyStreak(data.dailyHistory, today)} l={t('stats.streak')} />
        <Big n={maxDailyStreak(data.dailyHistory)} l={t('stats.bestStreak')} />
        <Big n={Object.keys(data.dailyHistory).length} l={t('stats.dailies')} />
      </div>
      <h3>{t('stats.bests')}</h3>
      <table className="table">
        <tbody>
          {ART_LEVELS.map((l) => {
            const b = data.bests[l];
            return (
              <tr key={l}>
                <th>{t(`level.${l}` as Key)}</th>
                <td>{b?.timeMs === undefined ? t('stats.none') : `${formatTime(b.timeMs)} · ${t('stats.moves', { n: b.moves ?? 0 })}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>{t('stats.recent')}</h3>
      {data.history.length === 0 ? <p>{t('stats.noGames')}</p> : (
        <table className="table">
          <tbody>
            {data.history.slice(-8).reverse().map((h, i) => (
              <tr key={i}>
                <th>{h.date.slice(5)}</th>
                <td>{getArtwork(h.artworkId)?.title ?? h.artworkId} · {formatTime(h.timeMs)} · {t('stats.moves', { n: h.moves })}</td>
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

export function ArtCreditsPage() {
  const t = useT();
  return (
    <Page title={t('credits.title')}>
      <p>{t('credits.intro')}</p>
      <ul className="credits" data-testid="credits">
        {ARTWORKS.map((a) => (
          <li key={a.id}>
            <b>{a.title}</b>, {a.artist}, {a.year}.<br />
            {a.museum} · <a href={a.licenseUrl} target="_blank" rel="noopener noreferrer">{a.license}</a> · <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">{t('credits.source')}</a> · {t('credits.checked', { date: a.verifiedAt })}
          </li>
        ))}
      </ul>
    </Page>
  );
}
