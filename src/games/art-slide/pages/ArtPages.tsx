import { useState } from 'react';
import { AdSlot } from '../../../ads/AdSlot';
import { Link } from '../../../components/Link';
import { go } from '../../../router';
import { currentDailyStreak, formatTime, maxDailyStreak } from '../../../storage/stats';
import { dailyNumber, jstDateKey } from '../../../utils/date';
import { Footer } from '../../../ui/Home';
import { Page } from '../../../ui/Pages';
import { ArtGameView } from '../components/ArtGameView';
import { ARTWORKS, getArtwork, nextArtwork } from '../data';
import { ART_SIZES, type ArtSize } from '../logic/board';
import { generateArtDaily, generateArtFree } from '../logic/generator';
import { newArtGame, type ArtState } from '../logic/game';
import { recordArtClear, useArtSave } from '../storage';

export function ArtHome() {
  const { data } = useArtSave();
  const today = jstDateKey();
  const streak = currentDailyStreak(data.dailyHistory, today);
  return (
    <div className="screen home">
      <div className="logo art-logo" aria-label="ART SLIDE">
        {'ART'.split('').map((c, i) => <span key={i} className="logo-tile g">{c}</span>)}
        <br />
        {'SLIDE'.split('').map((c, i) => <span key={i} className={`logo-tile ${i % 2 ? 'y' : 'x'}`}>{c}</span>)}
      </div>
      <p className="tagline">Reassemble a masterpiece.</p>
      <nav className="menu">
        <button className="btn primary big" data-testid="art-daily" onClick={() => go('daily')}>
          Daily Puzzle #{dailyNumber(today)}
          <small>{data.dailyHistory[today] ? '✓ Completed today' : '4×4 · new painting every day at 0:00 JST'}{streak > 0 ? ` · 🔥 ${streak}` : ''}</small>
        </button>
        <button className="btn big" data-testid="art-gallery" onClick={() => go('gallery')}>Choose Artwork</button>
        {data.inProgress.free && data.inProgress.free.status === 'playing' && (
          <button className="btn big" data-testid="art-resume" onClick={() => go('play')}>Resume puzzle</button>
        )}
        <button className="btn big" onClick={() => go('how')}>How to Play</button>
        <button className="btn big" onClick={() => go('stats')}>Statistics</button>
        <button className="btn big" onClick={() => go('credits')}>Artwork Credits</button>
        <button className="btn big" onClick={() => go('settings')}>Settings</button>
      </nav>
      <Footer />
    </div>
  );
}

export function ArtGallery() {
  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={() => go('')} aria-label="Back">←</button>
        <h1>CHOOSE ARTWORK</h1>
        <div className="top-right" />
      </header>
      <ul className="gallery" data-testid="gallery">
        {ARTWORKS.map((a) => (
          <li key={a.id}>
            <Link to={`/art-slide/play/${a.id}`} className="gcard" data-testid={`art-${a.id}`}>
              <img src={a.thumbnailUrl} alt={`${a.title} by ${a.artist}`} loading="lazy" decoding="async" width={Math.round(a.width / 4)} height={Math.round(a.height / 4)} />
              <span className="g-title">{a.title}</span>
              <span className="g-meta">{a.artist} · {a.year}</span>
            </Link>
          </li>
        ))}
      </ul>
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
      title={`DAILY #${dailyNumber(dateKey)}`}
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
  const { data, getData, setProgress, update } = useArtSave();
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
          <button className="icon-btn" onClick={() => go('')} aria-label="Back">←</button>
          <h1>ART SLIDE</h1>
          <div className="top-right" />
        </header>
        <p className="lead">Pick an artwork to start.</p>
        <button className="btn primary wide" onClick={() => go('gallery')}>CHOOSE ARTWORK</button>
      </div>
    );
  }

  const art = getArtwork(game.state.puzzle.artworkId)!;
  const start = (artId: string, size: ArtSize) => {
    update((d) => ({ ...d, lastSize: size }));
    const state = newArtGame(generateArtFree(artId, size));
    setProgress('free', state);
    setGame((g) => ({ key: (g?.key ?? 0) + 1, state }));
    if (artId !== art.id) history.replaceState(null, '', `/art-slide/play/${artId}`);
  };
  const size = game.state.puzzle.size;
  return (
    <ArtGameView
      key={game.key}
      initial={game.state}
      artwork={art}
      daily={false}
      title={`ART SLIDE · ${size}×${size}`}
      showNumbers={numbers}
      onToggleNumbers={setNumbers}
      onBack={() => go('')}
      onProgress={(s) => setProgress('free', s)}
      onCleared={(s) => update((d) => recordArtClear(d, { state: s, dateKey: jstDateKey() }))}
      onSize={(s) => start(art.id, s)}
      onNewPuzzle={() => start(art.id, size)}
      onPlayAgain={() => start(art.id, size)}
      onChangeArtwork={() => go('gallery')}
      onNextArtwork={() => start(nextArtwork(art.id).id, size)}
    />
  );
  void data;
}

export function ArtHowPage() {
  return (
    <Page title="HOW TO PLAY">
      <p>A famous painting has been cut into square tiles and shuffled, with one tile missing. Slide the tiles back into place to rebuild the painting.</p>
      <ul>
        <li>Tap a tile next to the empty space to slide it in. Only up, down, left and right: no diagonals, no swapping.</li>
        <li>The puzzle is solved when every tile is back in its place and the empty space is at the bottom right. The missing piece then appears and the painting is complete.</li>
        <li>Press <b>PREVIEW</b> whenever you want to see the finished painting. It is free, and the clock keeps running.</li>
        <li>Choose 3×3 (Easy), 4×4 (Normal) or 5×5 (Hard). Every shuffle is built from legal moves, so every puzzle can be solved.</li>
      </ul>
      <h3>Controls</h3>
      <ul>
        <li>Tap or click a tile, or swipe it towards the empty space. Arrow keys move the tile in that direction.</li>
        <li>Turn on <b>Show tile numbers</b> under the board if you want a little help.</li>
      </ul>
      <h3>Modes</h3>
      <p><b>Daily</b>: the same painting and the same 4×4 shuffle for everyone, new every day at 0:00 Japan time. <b>Choose Artwork</b>: pick any painting and any size; <b>NEW PUZZLE</b> reshuffles it, <b>RESTART</b> goes back to the same arrangement.</p>
      <p className="muted">The timer starts with your first move. All paintings are in the public domain; see Artwork Credits for the source of every image.</p>
    </Page>
  );
}

export function ArtStatsPage() {
  const { data } = useArtSave();
  const today = jstDateKey();
  return (
    <Page title="STATISTICS">
      <div className="stat-grid">
        <Big n={data.completed} l="COMPLETED" />
        <Big n={currentDailyStreak(data.dailyHistory, today)} l="DAILY STREAK" />
        <Big n={maxDailyStreak(data.dailyHistory)} l="BEST DAILY STREAK" />
        <Big n={Object.keys(data.dailyHistory).length} l="DAILIES DONE" />
      </div>
      <h3>Personal bests (time / fewest moves)</h3>
      <table className="table">
        <tbody>
          {ART_SIZES.map((s) => {
            const b = data.bests[s];
            return (
              <tr key={s}>
                <th>{s}×{s}</th>
                <td>{b?.timeMs === undefined ? '–' : `${formatTime(b.timeMs)} / ${b.moves} moves`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Recent games</h3>
      {data.history.length === 0 ? <p>No games yet.</p> : (
        <table className="table">
          <tbody>
            {data.history.slice(-8).reverse().map((h, i) => (
              <tr key={i}>
                <th>{h.date.slice(5)} {h.mode === 'daily' ? 'Daily' : `${h.size}×${h.size}`}</th>
                <td>{getArtwork(h.artworkId)?.title ?? h.artworkId} · {formatTime(h.timeMs)} · {h.moves}m</td>
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
  return (
    <Page title="ARTWORK CREDITS">
      <p>Every painting in ART SLIDE comes from a museum open-access program and is in the public domain (CC0). Images were downloaded from the museums' official APIs after checking each work's public-domain flag, then resized for this site. The short descriptions are original text written for this site.</p>
      <ul className="credits" data-testid="credits">
        {ARTWORKS.map((a) => (
          <li key={a.id}>
            <b>{a.title}</b>, {a.artist}, {a.year}.<br />
            {a.museum} · <a href={a.licenseUrl} target="_blank" rel="noopener noreferrer">{a.license}</a> · <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Source page</a> · checked {a.verifiedAt}
          </li>
        ))}
      </ul>
    </Page>
  );
}
