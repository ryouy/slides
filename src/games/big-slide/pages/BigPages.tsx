import { BackButton } from '../../../components/Icons';
import { useState } from 'react';
import { AdSlot } from '../../../ads/AdSlot';
import { useT } from '../../../i18n';
import { go } from '../../../router';
import { dailyNumber, jstDateKey } from '../../../utils/date';
import { currentDailyStreak, formatTime, maxDailyStreak } from '../../../storage/stats';
import { Footer } from '../../../ui/Home';
import { BackToMain } from '../../../components/GameNav';
import { HomeLinks } from '../../../components/HomeLinks';
import { Page } from '../../../ui/Pages';
import { BigGameView } from '../components/BigGameView';
import { generateBigDaily, generateBigEndless } from '../logic/generator';
import { newBigGame, type BigState } from '../logic/game';
import { BOARD_SIZES, VARIANT_IDS, type BoardSize, type Difficulty, type Variant } from '../logic/types';
import { VARIANTS } from '../logic/variants';
import { bestKey, recordBigClear, useBigSave } from '../storage';

export function BigHome() {
  const t = useT();
  const { data } = useBigSave();
  const today = jstDateKey();
  const streak = currentDailyStreak(data.dailyHistory, today);
  return (
    <div className="screen home">
      <BackToMain />
      <div className="logo" aria-label="BIG SLIDE">
        <span className="logo-tile big-logo">BIG</span>
        {'SLIDE'.split('').map((c, i) => <span key={i} className={`logo-tile ${i % 2 ? 'y' : 'x'}`}>{c}</span>)}
      </div>
      <nav className="menu">
        <button className="btn primary big" data-testid="big-daily" onClick={() => go('daily')}>
          {t('home.dailyN', { n: dailyNumber(today) })}{data.dailyHistory[today] ? ' ✓' : ''}{streak > 0 ? ` · 🔥 ${streak}` : ''}
        </button>
        <button className="btn big" data-testid="big-endless" onClick={() => go('endless')}>{t('home.endless')}</button>
      </nav>
      <HomeLinks items={[{ label: t('home.howTo'), to: 'how' }, { label: t('home.stats'), to: 'stats' }, { label: t('home.settings'), to: 'settings' }]} />
      <Footer />
    </div>
  );
}

export function BigDaily() {
  const t = useT();
  const { getData, setProgress, update } = useBigSave();
  const [dateKey] = useState(() => jstDateKey());
  const [initial] = useState<BigState>(() => {
    const saved = getData().inProgress.daily;
    return saved && saved.puzzle.id === `bigdaily-${dateKey}` ? saved : newBigGame(generateBigDaily(dateKey));
  });
  return (
    <BigGameView
      initial={initial}
      title={t('art.dailyTitle', { n: dailyNumber(dateKey) })}
      onBack={() => go('')}
      onProgress={(s) => setProgress('daily', s)}
      onCleared={(s) => update((d) => recordBigClear(d, { puzzle: s.puzzle, dateKey, timeMs: s.elapsedMs, moves: s.moves, bigMoves: s.bigMoves }))}
      onNext={() => go('endless')}
      nextLabel={t('home.endless')}
    />
  );
}

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

export function BigEndless() {
  const t = useT();
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
          <BackButton onClick={() => go('')} label={t('common.back')} />
          <h1>{t('home.endless')}</h1>
          <div className="top-right" />
        </header>
        <div className="picker-label">{t('big.blocks')}</div>
        <div className="variant-grid" role="group" aria-label={t('big.blocks')}>
          {VARIANT_IDS.map((v) => (
            <button key={v} className={`variant-btn${variant === v ? ' on' : ''}`} aria-pressed={variant === v} data-testid={`variant-${v}`} onClick={() => setVariant(v)}>
              <strong>{VARIANTS[v].label}</strong>
            </button>
          ))}
        </div>
        <div className="picker-label">{t('big.size')}</div>
        <div className="seg" role="group" aria-label={t('big.size')}>
          {BOARD_SIZES.map((s) => (
            <button key={s} className={`seg-btn${size === s ? ' on' : ''}`} aria-pressed={size === s} data-testid={`size-${s}`} onClick={() => setSize(s)}>
              {s}×{s}
            </button>
          ))}
        </div>
        <div className="picker-label">{t('big.difficulty')}</div>
        {generating ? (
          <p className="gen-note" role="status" data-testid="generating">{t('big.building')}</p>
        ) : (
          <div className="cards">
            {DIFFS.map((d) => {
              const best = data.bests[bestKey(size, d, variant)];
              return (
                <button key={d} className="card" data-testid={`bdiff-${d}`} onClick={() => start(variant, size, d)}>
                  <strong>{t(`diff.${d}`)}</strong>
                  {best?.timeMs !== undefined && <small>{formatTime(best.timeMs)} · {best.moves}</small>}
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
      title={`${t('home.endless')} · ${v === 'classic' ? '' : `${VARIANTS[v].label} · `}${p.size}×${p.size} · ${t(`diff.${p.difficulty}`)}`}
      onBack={() => go('')}
      onProgress={(s) => setProgress('endless', s)}
      onCleared={(s) => update((d) => recordBigClear(d, { puzzle: s.puzzle, dateKey: jstDateKey(), timeMs: s.elapsedMs, moves: s.moves, bigMoves: s.bigMoves }))}
      onNext={() => start(v, p.size, p.difficulty)}
      nextLabel={t('result.next')}
      headerRight={<span className="streak" title={t('stats.endlessStreak')}>🔥 {data.endlessStreak}</span>}
      footerExtra={<button className="btn" onClick={abandon}>{t('big.new')}</button>}
    />
  );
}

export function BigHowPage() {
  const t = useT();
  return (
    <Page title={t('home.howTo')}>
      <p>{t('bigHow.intro')}</p>
      <ul>
        <li>{t('bigHow.tiles')}</li>
        <li>{t('bigHow.slide')}</li>
        <li>{t('bigHow.blocks')}</li>
        <li>{t('bigHow.rules')}</li>
        <li>{t('bigHow.found')}</li>
      </ul>
      <h3>{t('bigHow.setsTitle')}</h3>
      <ul>
        <li>{t('bigHow.classic')}</li>
        <li>{t('bigHow.duo')}</li>
        <li>{t('bigHow.shapes')}</li>
        <li>{t('bigHow.mega')}</li>
      </ul>
      <h3>{t('help.controls')}</h3>
      <p>{t('bigHow.controls')}</p>
      <h3>{t('help.modes')}</h3>
      <p>{t('bigHow.modes')}</p>
      <p className="muted">{t('bigHow.note')}</p>
    </Page>
  );
}

export function BigStatsPage() {
  const t = useT();
  const { data } = useBigSave();
  const today = jstDateKey();
  return (
    <Page title={t('stats.title')}>
      <div className="stat-grid">
        <Big n={data.completed} l={t('stats.completed')} />
        <Big n={currentDailyStreak(data.dailyHistory, today)} l={t('stats.streak')} />
        <Big n={maxDailyStreak(data.dailyHistory)} l={t('stats.bestStreak')} />
        <Big n={data.endlessStreak} l={t('stats.endlessStreak')} />
      </div>
      <h3>{t('stats.endlessBests')}</h3>
      {Object.keys(data.bests).length === 0 ? <p>{t('stats.noGames')}</p> : (
        <table className="table">
          <tbody>
            {Object.entries(data.bests).sort(([a], [b]) => a.localeCompare(b)).map(([k, b]) => {
              const parts = k.split('-');
              const [variant, size, diff] = parts.length === 3 ? parts : ['classic', parts[0], parts[1]];
              return (
                <tr key={k}>
                  <th>{variant === 'classic' ? '' : `${variant} `}{size}×{size} {diff}</th>
                  <td>{b.timeMs === undefined ? '–' : `${formatTime(b.timeMs)} / ${t('stats.moves', { n: b.moves ?? 0 })}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <h3>{t('stats.recent')}</h3>
      {data.history.length === 0 ? <p>{t('stats.noGames')}</p> : (
        <table className="table">
          <tbody>
            {data.history.slice(-8).reverse().map((h, i) => (
              <tr key={i}>
                <th>{h.date.slice(5)} {h.mode === 'daily' ? t('home.dailyShort') : `${h.variant && h.variant !== 'classic' ? `${h.variant} ` : ''}${h.size}×${h.size} ${h.difficulty}`}</th>
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
