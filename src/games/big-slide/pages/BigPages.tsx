import { useState } from 'react';
import { AdSlot } from '../../../ads/AdSlot';
import { go } from '../../../router';
import { dailyNumber, jstDateKey } from '../../../utils/date';
import { currentDailyStreak, formatTime, maxDailyStreak } from '../../../storage/stats';
import { Footer } from '../../../ui/Home';
import { AllGamesLink } from '../../../components/GameNav';
import { HomeLinks } from '../../../components/HomeLinks';
import { Page } from '../../../ui/Pages';
import { BigGameView } from '../components/BigGameView';
import { generateBigDaily, generateBigEndless } from '../logic/generator';
import { newBigGame, type BigState } from '../logic/game';
import { BOARD_SIZES, VARIANT_IDS, type BoardSize, type Difficulty, type Variant } from '../logic/types';
import { VARIANTS } from '../logic/variants';
import { bestKey, recordBigClear, useBigSave } from '../storage';

export function BigHome() {
  const { data } = useBigSave();
  const today = jstDateKey();
  const streak = currentDailyStreak(data.dailyHistory, today);
  return (
    <div className="screen home">
      <AllGamesLink />
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
      </nav>
      <HomeLinks items={[{ label: 'How to Play', to: 'how' }, { label: 'Statistics', to: 'stats' }, { label: 'Settings', to: 'settings' }]} />
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
  { id: 'easy', name: 'Easy', desc: 'Short solution (about 4-8 moves)' },
  { id: 'normal', name: 'Normal', desc: 'Medium solution (about 8-16 moves)' },
  { id: 'hard', name: 'Hard', desc: 'Long solution, every big block must travel' },
];

export function BigEndless() {
  const { data, getData, setProgress, update } = useBigSave();
  const [size, setSize] = useState<BoardSize>(() => data.lastSize);
  const [variant, setVariant] = useState<Variant>(() => data.lastVariant ?? 'classic');
  const [generating, setGenerating] = useState(false);
  const [game, setGame] = useState<{ key: number; state: BigState } | null>(() => {
    const s = getData().inProgress.endless;
    return s ? { key: 0, state: s } : null;
  });

  const start = (v: Variant, sz: BoardSize, difficulty: Difficulty) => {
    update((d) => ({ ...d, lastSize: sz, lastDifficulty: difficulty, lastVariant: v }));
    setGenerating(true);
    // let the "Building puzzle" note paint first: generating can take a moment on big boards
    setTimeout(() => {
      const state = newBigGame(generateBigEndless(sz, difficulty, undefined, v));
      setProgress('endless', state);
      setGame((g) => ({ key: (g?.key ?? 0) + 1, state }));
      setGenerating(false);
    }, 30);
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
        <p className="lead">Streak: <b>{data.endlessStreak}</b></p>
        <div className="picker-label">Blocks</div>
        <div className="variant-grid" role="group" aria-label="Block set">
          {VARIANT_IDS.map((v) => (
            <button key={v} className={`variant-btn${variant === v ? ' on' : ''}`} aria-pressed={variant === v} data-testid={`variant-${v}`} onClick={() => setVariant(v)}>
              <strong>{VARIANTS[v].label}</strong>
              <span>{VARIANTS[v].desc}</span>
            </button>
          ))}
        </div>
        <div className="picker-label">Board size</div>
        <div className="seg" role="group" aria-label="Board size">
          {BOARD_SIZES.map((s) => (
            <button key={s} className={`seg-btn${size === s ? ' on' : ''}`} aria-pressed={size === s} data-testid={`size-${s}`} onClick={() => setSize(s)}>
              {s}×{s}
            </button>
          ))}
        </div>
        <div className="picker-label">Difficulty</div>
        {generating ? (
          <p className="gen-note" role="status" data-testid="generating">Building puzzle…</p>
        ) : (
          <div className="cards">
            {DIFFS.map((d) => {
              const best = data.bests[bestKey(size, d.id, variant)];
              return (
                <button key={d.id} className="card" data-testid={`bdiff-${d.id}`} onClick={() => start(variant, size, d.id)}>
                  <strong>{d.name}</strong>
                  <span>{d.desc}</span>
                  <small>{best?.timeMs !== undefined ? `Best ${formatTime(best.timeMs)} · ${best.moves} moves` : 'No record yet'}</small>
                </button>
              );
            })}
          </div>
        )}
        <AdSlot />
      </div>
    );
  }

  const p = game.state.puzzle;
  const v = p.variant ?? 'classic';
  return (
    <BigGameView
      key={game.key}
      initial={game.state}
      title={`ENDLESS · ${v === 'classic' ? '' : `${VARIANTS[v].label.toUpperCase()} · `}${p.size}×${p.size} · ${p.difficulty.toUpperCase()}`}
      onBack={() => go('')}
      onProgress={(s) => setProgress('endless', s)}
      onCleared={(s) => update((d) => recordBigClear(d, { puzzle: s.puzzle, dateKey: jstDateKey(), timeMs: s.elapsedMs, moves: s.moves, bigMoves: s.bigMoves }))}
      onNext={() => start(v, p.size, p.difficulty)}
      nextLabel="NEXT PUZZLE"
      headerRight={<span className="streak" title="Streak">🔥 {data.endlessStreak}</span>}
      footerExtra={<button className="btn" onClick={abandon}>NEW</button>}
    />
  );
}

export function BigHowPage() {
  return (
    <Page title="HOW TO PLAY">
      <p>Slide the tiles until the board matches the <b>GOAL</b> picture: every numbered tile and every big block on its goal cell.</p>
      <ul>
        <li>Numbered tiles are 1×1. Big blocks are single pieces that slide as a whole and never rotate.</li>
        <li>A numbered tile slides into a gap next to it.</li>
        <li>A big block slides one step only if <b>every cell it would newly cover is a gap</b>. A 2×2 block needs two gaps side by side; an L-shaped block needs gaps that fit its notch.</li>
        <li>No diagonals, no rotating, one piece per move. Every big block always has to move at least once.</li>
        <li>Pieces that already sit on their goal cell get a green outline.</li>
      </ul>
      <h3>Block sets (Endless)</h3>
      <ul>
        <li><b>Classic</b>: one 2×2 block, 2 gaps.</li>
        <li><b>Duo</b>: two 2×2 blocks, A and B, 3 gaps. They are not interchangeable.</li>
        <li><b>Shapes</b>: an L-shaped block and a 1×2 block, 3 gaps.</li>
        <li><b>Mega</b>: one huge 2×3 block, 3 gaps.</li>
      </ul>
      <h3>Controls</h3>
      <ul>
        <li>Tap a tile beside a gap to slide it. If it could go in several directions, arrows appear: tap one.</li>
        <li>Or swipe a piece in the direction you want. Keyboard: arrow keys move the selected piece (or the only piece that can go that way).</li>
      </ul>
      <h3>Modes</h3>
      <p><b>Daily</b>: the same 4×4 Classic Normal puzzle for everyone, new every day at 0:00 Japan time. <b>Endless</b>: any block set, 4×4, 5×5 or 6×6, at Easy, Normal or Hard.</p>
      <p className="muted">Easy and Normal puzzles are built so that their shortest solution has a verified length. Hard puzzles are guaranteed to need a long solution where every big block travels; on big Duo/Shapes/Mega boards Hard can occasionally be served as Normal (the title always shows the real level).</p>
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
      {Object.keys(data.bests).length === 0 ? <p>No records yet.</p> : (
        <table className="table">
          <tbody>
            {Object.entries(data.bests).sort(([a], [b]) => a.localeCompare(b)).map(([k, b]) => {
              const parts = k.split('-');
              const [variant, size, diff] = parts.length === 3 ? parts : ['classic', parts[0], parts[1]];
              return (
                <tr key={k}>
                  <th>{variant === 'classic' ? '' : `${variant} `}{size}×{size} {diff}</th>
                  <td>{b.timeMs === undefined ? '–' : `${formatTime(b.timeMs)} / ${b.moves} moves`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <h3>Recent games</h3>
      {data.history.length === 0 ? <p>No games yet.</p> : (
        <table className="table">
          <tbody>
            {data.history.slice(-8).reverse().map((h, i) => (
              <tr key={i}>
                <th>{h.date.slice(5)} {h.mode === 'daily' ? 'Daily' : `${h.variant && h.variant !== 'classic' ? `${h.variant} ` : ''}${h.size}×${h.size} ${h.difficulty}`}</th>
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
