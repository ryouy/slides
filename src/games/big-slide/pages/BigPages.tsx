import { useState } from 'react';
import { AdSlot } from '../../../ads/AdSlot';
import { go } from '../../../router';
import { dailyNumber, jstDateKey } from '../../../utils/date';
import { currentDailyStreak, formatTime, maxDailyStreak } from '../../../storage/stats';
import { Footer } from '../../../ui/Home';
import { Page } from '../../../ui/Pages';
import { BigGameView } from '../components/BigGameView';
import { generateBigDaily, generateBigEndless } from '../logic/generator';
import { newBigGame, type BigState } from '../logic/game';
import { BOARD_SIZES, type BoardSize, type Difficulty } from '../logic/types';
import { bestKey, recordBigClear, useBigSave } from '../storage';

export function BigHome() {
  const { data } = useBigSave();
  const today = jstDateKey();
  const streak = currentDailyStreak(data.dailyHistory, today);
  return (
    <div className="screen home">
      <div className="logo" aria-label="BIG SLIDE">
        <span className="logo-tile big-logo">BIG</span>
        {'SLIDE'.split('').map((c, i) => <span key={i} className={`logo-tile ${i % 2 ? 'y' : 'x'}`}>{c}</span>)}
      </div>
      <p className="tagline">Make room, then slide the giant tile home.</p>
      <nav className="menu">
        <button className="btn primary big" data-testid="big-daily" onClick={() => go('daily')}>
          Daily Puzzle #{dailyNumber(today)}
          <small>{data.dailyHistory[today] ? '✓ Cleared today' : '4×4 Normal · new every day at 0:00 JST'}{streak > 0 ? ` · 🔥 ${streak}` : ''}</small>
        </button>
        <button className="btn big" data-testid="big-endless" onClick={() => go('endless')}>Endless Mode</button>
        <button className="btn big" onClick={() => go('how')}>How to Play</button>
        <button className="btn big" onClick={() => go('stats')}>Statistics</button>
        <button className="btn big" onClick={() => go('settings')}>Settings</button>
      </nav>
      <Footer />
    </div>
  );
}

export function BigDaily() {
  const { getData, setProgress, update } = useBigSave();
  const [dateKey] = useState(() => jstDateKey());
  const [initial] = useState<BigState>(() => {
    const saved = getData().inProgress.daily;
    return saved && saved.puzzle.id === `bigdaily-${dateKey}` ? saved : newBigGame(generateBigDaily(dateKey));
  });
  return (
    <BigGameView
      initial={initial}
      title={`DAILY #${dailyNumber(dateKey)}`}
      onBack={() => go('')}
      onProgress={(s) => setProgress('daily', s)}
      onCleared={(s) => update((d) => recordBigClear(d, { puzzle: s.puzzle, dateKey, timeMs: s.elapsedMs, moves: s.moves, bigMoves: s.bigMoves }))}
      onNext={() => go('endless')}
      nextLabel="TRY ENDLESS"
    />
  );
}

const DIFFS: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'easy', name: 'Easy', desc: 'About 5-8 moves, one big-tile move' },
  { id: 'normal', name: 'Normal', desc: 'About 12-16 moves, the big tile must move' },
  { id: 'hard', name: 'Hard', desc: '20+ moves, several big-tile moves' },
];

export function BigEndless() {
  const { data, getData, setProgress, update } = useBigSave();
  const [size, setSize] = useState<BoardSize>(() => data.lastSize);
  const [game, setGame] = useState<{ key: number; state: BigState } | null>(() => {
    const s = getData().inProgress.endless;
    return s ? { key: 0, state: s } : null;
  });

  const start = (sz: BoardSize, difficulty: Difficulty) => {
    update((d) => ({ ...d, lastSize: sz, lastDifficulty: difficulty }));
    const state = newBigGame(generateBigEndless(sz, difficulty));
    setProgress('endless', state);
    setGame((g) => ({ key: (g?.key ?? 0) + 1, state }));
  };

  const abandon = () => {
    const cur = getData().inProgress.endless;
    if (cur && cur.status !== 'cleared' && cur.started) update((d) => ({ ...d, endlessStreak: 0 }));
    setProgress('endless', undefined);
    setGame(null);
  };

  if (!game) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={() => go('')} aria-label="Back">←</button>
          <h1>ENDLESS</h1>
          <div className="top-right" />
        </header>
        <p className="lead">Board size · Streak: <b>{data.endlessStreak}</b></p>
        <div className="seg" role="group" aria-label="Board size">
          {BOARD_SIZES.map((s) => (
            <button key={s} className={`seg-btn${size === s ? ' on' : ''}`} aria-pressed={size === s} data-testid={`size-${s}`} onClick={() => setSize(s)}>
              {s}×{s}
            </button>
          ))}
        </div>
        <div className="cards">
          {DIFFS.map((d) => {
            const best = data.bests[bestKey(size, d.id)];
            return (
              <button key={d.id} className="card" data-testid={`bdiff-${d.id}`} onClick={() => start(size, d.id)}>
                <strong>{d.name}</strong>
                <span>{d.desc}</span>
                <small>{best?.timeMs !== undefined ? `Best ${formatTime(best.timeMs)} · ${best.moves} moves` : 'No record yet'}</small>
              </button>
            );
          })}
        </div>
        <AdSlot />
      </div>
    );
  }

  const p = game.state.puzzle;
  return (
    <BigGameView
      key={game.key}
      initial={game.state}
      title={`ENDLESS · ${p.size}×${p.size} · ${p.difficulty.toUpperCase()}`}
      onBack={() => go('')}
      onProgress={(s) => setProgress('endless', s)}
      onCleared={(s) => update((d) => recordBigClear(d, { puzzle: s.puzzle, dateKey: jstDateKey(), timeMs: s.elapsedMs, moves: s.moves, bigMoves: s.bigMoves }))}
      onNext={() => start(p.size, p.difficulty)}
      nextLabel="NEXT PUZZLE"
      headerRight={<span className="streak" title="Streak">🔥 {data.endlessStreak}</span>}
      footerExtra={<button className="btn" onClick={abandon}>NEW</button>}
    />
  );
}

export function BigHowPage() {
  return (
    <Page title="HOW TO PLAY">
      <p>Slide the tiles until the board matches the <b>GOAL</b> picture: every numbered tile and the <b>BIG</b> tile on its goal cell.</p>
      <ul>
        <li>Numbered tiles are 1×1. The BIG tile is 2×2 and moves as one piece.</li>
        <li>There are two blank cells. A numbered tile slides into a blank cell next to it.</li>
        <li>The BIG tile slides one step only if <b>every cell it would newly cover is blank</b>: a whole row or column of two blanks beside it.</li>
        <li>No diagonals, no rotating, one tile per move. The BIG tile always needs to move at least once.</li>
        <li>Tiles that already sit on their goal cell get a green outline.</li>
      </ul>
      <h3>Controls</h3>
      <ul>
        <li>Tap a tile beside a gap to slide it. If it could go in several directions, arrows appear: tap one.</li>
        <li>Or swipe a tile in the direction you want. Keyboard: arrow keys move the selected tile (or the only tile that can go that way).</li>
      </ul>
      <h3>Modes</h3>
      <p><b>Daily</b>: the same 4×4 Normal puzzle for everyone, new every day at 0:00 Japan time. <b>Endless</b>: 4×4, 5×5 or 6×6 at Easy, Normal or Hard.</p>
      <p className="muted">Easy and Normal puzzles are built so that the shortest solution has a known length. Hard puzzles force several BIG-tile moves.</p>
    </Page>
  );
}

export function BigStatsPage() {
  const { data } = useBigSave();
  const today = jstDateKey();
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
          {BOARD_SIZES.flatMap((s) =>
            (['easy', 'normal', 'hard'] as const).map((d) => {
              const b = data.bests[bestKey(s, d)];
              return (
                <tr key={`${s}${d}`}>
                  <th>{s}×{s} {d}</th>
                  <td>{b?.timeMs === undefined ? '–' : `${formatTime(b.timeMs)} / ${b.moves} moves`}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
      <h3>Recent games</h3>
      {data.history.length === 0 ? <p>No games yet.</p> : (
        <table className="table">
          <tbody>
            {data.history.slice(-8).reverse().map((h, i) => (
              <tr key={i}>
                <th>{h.date.slice(5)} {h.mode === 'daily' ? 'Daily' : `${h.size}×${h.size} ${h.difficulty}`}</th>
                <td>{formatTime(h.timeMs)} · {h.moves}m · {h.bigMoves}B</td>
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
