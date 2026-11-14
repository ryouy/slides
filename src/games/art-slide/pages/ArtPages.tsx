import { BackButton, ChevronRight } from '../../../components/Icons';
import { useMemo, useState } from 'react';
import { AdSlot } from '../../../ads/AdSlot';
import { Link } from '../../../components/Link';
import { useT, type Key } from '../../../i18n';
import { go } from '../../../router';
import { currentDailyStreak, formatTime, maxDailyStreak } from '../../../storage/stats';
import { dailyNumber, jstDateKey } from '../../../utils/date';
import { Page } from '../../../ui/Pages';
import { ArtGameView } from '../components/ArtGameView';
import { ARTWORKS, getArtwork, nextArtwork, pickRandomArtwork } from '../data';
import { ART_LEVELS, type ArtLevel } from '../logic/board';
import { GALLERY_COLUMN_OPTIONS, GROUP_OPTIONS, SORT_OPTIONS, filterArtworks, groupArtworks, type GalleryColumns, type GroupBy, type SortBy } from '../logic/gallery';
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
      <header className="art-home-head">
        <h1 className="art-home-title">ART SLIDE</h1>
      </header>
      <Link to="/art-slide/daily" className="exhibit-card" data-testid="exhibit">
        <img src={exhibit.thumbnailUrl} alt="" width={96} height={96} />
        <span className="ex-text">
          <small>{t('art.exhibitN', { n: dailyNumber(today) })}{done ? ' ✓' : ''}{streak > 0 ? ` · ${t('home.streak', { n: streak })}` : ''}</small>
          <b>{exhibit.title}</b>
          <span>{exhibit.artist}, {exhibit.year}</span>
          <span className="ex-enter">{t('art.openExhibit')} <ChevronRight size={14} /></span>
        </span>
      </Link>
      <nav className="menu art-home-menu" aria-label={t('home.explore')}>
        <button className="btn big" data-testid="art-gallery" onClick={() => go('gallery')}>{t('art.gallery')}</button>
        <button className="btn big" data-testid="art-random" onClick={() => go(`play/${pickRandomArtwork().id}`)}>{t('art.random')}</button>
        {resumable && <button className="btn big" data-testid="art-resume" onClick={() => go('play')}>{t('art.resume')}</button>}
      </nav>
      <div className="art-home-secondary">
        <details className="art-more" data-testid="art-more">
        <summary>{t('home.other')}</summary>
        <div className="art-more-content">
          <nav className="art-more-main" aria-label={t('home.other')}>
            <Link to="/art-slide/how">{t('home.howTo')}</Link>
            <Link to="/art-slide/stats">{t('home.stats')}</Link>
            <Link to="/art-slide/credits">{t('home.credits')}</Link>
          </nav>
          <nav className="art-more-puzzles" aria-label={t('home.more')}>
            <Link to="/big-slide" data-testid="more-big">BIG SLIDE</Link>
            <Link to="/word-slide" data-testid="more-word">WORD SLIDE</Link>
          </nav>
          <nav className="art-more-sub" aria-label={t('common.about')}>
            <Link to="/about">{t('common.about')}</Link>
            <Link to="/privacy">{t('common.privacy')}</Link>
            <Link to="/terms">{t('common.terms')}</Link>
            <Link to="/contact">{t('common.contact')}</Link>
          </nav>
        </div>
        </details>
        <Link to="/settings" className="art-home-settings" data-testid="art-settings">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M9.8 2.8h4.4l.6 2.1 1.8.9 2-.9 3.1 3.1-.9 2 .9 1.8 2.1.6v4.4l-2.1.6-.9 1.8.9 2-3.1 3.1-2-.9-1.8.9-.6 2.1H9.8l-.6-2.1-1.8-.9-2 .9-3.1-3.1.9-2-.9-1.8-2.1-.6v-4.4l2.1-.6.9-1.8-.9-2 3.1-3.1 2 .9 1.8-.9.6-2.1Z" transform="translate(2 2) scale(.83)" />
          </svg>
          <span>{t('home.settings')}</span>
        </Link>
      </div>
    </div>
  );
}

const slugId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function ArtGallery() {
  const t = useT();
  const { data, update } = useArtSave();
  const { groupBy, sortBy, columns, randomSeed } = data.gallery;
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterArtworks(ARTWORKS, query), [query]);
  const groups = useMemo(() => groupArtworks(filtered, groupBy, sortBy, randomSeed), [filtered, groupBy, sortBy, randomSeed]);
  const setPrefs = (p: Partial<typeof data.gallery>) => update((d) => ({ ...d, gallery: { ...d.gallery, ...p } }));
  const newRandomSeed = () => Math.floor(Math.random() * 0x100000000);
  const chooseSort = (next: SortBy) => setPrefs(
    next === 'random'
      ? { sortBy: next, groupBy: 'none', randomSeed: newRandomSeed() }
      : { sortBy: next },
  );
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
        <div className="gal-sort-field">
          <label>
            <span>{t('gal.sortBy')}</span>
            <select aria-label={t('gal.sortBy')} data-testid="sort-by" value={sortBy} onChange={(e) => chooseSort(e.target.value as SortBy)}>
              {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{t(`sort.${o.id}` as Key)}</option>)}
            </select>
          </label>
          {sortBy === 'random' && (
            <button className="gal-reshuffle" data-testid="gal-reshuffle" type="button"
              aria-label={t('gal.reshuffle')} title={t('gal.reshuffle')}
              onClick={() => setPrefs({ randomSeed: newRandomSeed() })}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 7v5h-5M4 17v-5h5" />
                <path d="M5.9 9A7.3 7.3 0 0 1 19.6 12M18.1 15A7.3 7.3 0 0 1 4.4 12" />
              </svg>
            </button>
          )}
        </div>
        <label className="gal-columns-field">
          <span>{t('gal.columns')}</span>
          <select aria-label={t('gal.columns')} data-testid="gal-columns" value={String(columns)}
            onChange={(e) => {
              const value = e.target.value === 'auto' ? 'auto' : Number(e.target.value);
              if (GALLERY_COLUMN_OPTIONS.includes(value as GalleryColumns)) setPrefs({ columns: value as GalleryColumns });
            }}>
            {GALLERY_COLUMN_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>{n === 'auto' ? t('gal.columnsAuto') : String(n)}</option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length !== ARTWORKS.length && <p className="gal-count" data-testid="gal-count">{t('gal.filtered', { n: filtered.length, total: ARTWORKS.length })}</p>}
      <div data-testid="gallery">
        {groups.length === 0 && <p className="gal-empty">{t('gal.empty', { q: query })}</p>}
        {groups.map((g) => (
          <section key={g.key} className="gal-group" data-testid={`group-${slugId(g.key)}`}>
            {g.label && <h2 className="gal-h">{groupLabel(g.label)} <small>{g.items.length}</small></h2>}
            <ul className="gallery" data-columns={columns} key={`${groupBy}-${sortBy}-${randomSeed}`}
              style={columns === 'auto' ? undefined : { ['--gallery-cols' as string]: columns }}>
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
            {a.descriptionLicenseUrl && (
              <span className="credits-description">
                <br />
                {t('art.textSource')}: <a href={a.descriptionSourceUrl ?? a.sourceUrl} target="_blank" rel="noopener noreferrer">{a.descriptionAttribution ?? a.museum}</a>
                {' · '}<a href={a.descriptionLicenseUrl} target="_blank" rel="noopener noreferrer">{a.descriptionLicense ?? 'CC BY 4.0'}</a>
                {a.descriptionModifications && <> · {a.descriptionModifications}</>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Page>
  );
}
