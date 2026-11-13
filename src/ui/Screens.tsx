import { useState } from 'react';
import { go } from '../nav';
import { dailyNumber, generateDaily, generateEndless, jstDateKey } from '../core/generator';
import { isNoHintClear, newGame, type GameState } from '../core/game';
import { totalHintUse } from '../core/hints';
import type { Difficulty } from '../core/types';
import { useSave } from '../storage/SaveContext';
import { formatTime, recordClear } from '../storage/stats';
import { AdSlot } from '../ads/AdSlot';
import { GameView } from './GameView';

export function DailyScreen() {
  const { getData, setProgress, update } = useSave();
  const [dateKey] = useState(() => jstDateKey());
  const [initial] = useState<GameState>(() => {
    const saved = getData().inProgress.daily;
    if (saved && saved.puzzle.id === `daily-${dateKey}`) return saved;
    return newGame(generateDaily(dateKey));
  });
  return (
    <GameView
      initial={initial}
      title={`DAILY #${dailyNumber(dateKey)}`}
      onBack={() => go('')}
      onProgress={(s) => setProgress('daily', s)}
      onCleared={(s) =>
        update((d) => recordClear(d, { mode: 'daily', difficulty: 'normal', dateKey, number: s.puzzle.number, timeMs: s.elapsedMs, moves: s.moves, checks: s.checks, hints: totalHintUse(s.hintUse), noHint: isNoHintClear(s) }))
      }
      onNext={() => go('endless')}
      nextLabel="TRY ENDLESS"
    />
  );
}

const DIFFS: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'easy', name: 'Easy', desc: 'Everyday words, gentle shuffle' },
  { id: 'normal', name: 'Normal', desc: 'Common words, standard shuffle' },
  { id: 'hard', name: 'Hard', desc: 'Trickier words, heavy shuffle' },
];

export function EndlessScreen() {
  const { data, getData, setProgress, update } = useSave();
  const [game, setGame] = useState<{ key: number; state: GameState } | null>(() => {
    const s = getData().inProgress.endless;
    return s ? { key: 0, state: s } : null;
  });

  const start = (difficulty: Difficulty, keepStreak = true) => {
    update((d) => ({ ...d, lastDifficulty: difficulty, endlessStreak: keepStreak ? d.endlessStreak : 0 }));
    const state = newGame(generateEndless(difficulty));
    setProgress('endless', state);
    setGame((g) => ({ key: (g?.key ?? 0) + 1, state }));
  };

  const abandon = () => {
    const cur = getData().inProgress.endless;
    // leaving an unsolved puzzle behind breaks the streak
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
        <p className="lead">Pick a difficulty. Streak: <b>{data.endlessStreak}</b></p>
        <div className="cards">
          {DIFFS.map((d) => {
            const best = data.bests[d.id];
            return (
              <button key={d.id} className="card" data-testid={`diff-${d.id}`} onClick={() => start(d.id)}>
                <strong>{d.name}</strong>
                <span>{d.desc}</span>
                <small>{best.timeMs !== undefined ? `Best ${formatTime(best.timeMs)} · ${best.moves} moves` : 'No record yet'}</small>
              </button>
            );
          })}
        </div>
        <AdSlot />
      </div>
    );
  }

  const diff = game.state.puzzle.difficulty;
  return (
    <GameView
      key={game.key}
      initial={game.state}
      title={`ENDLESS · ${diff.toUpperCase()}`}
      onBack={() => go('')}
      onProgress={(s) => setProgress('endless', s)}
      onCleared={(s) =>
        update((d) => recordClear(d, { mode: 'endless', difficulty: s.puzzle.difficulty, dateKey: jstDateKey(), timeMs: s.elapsedMs, moves: s.moves, checks: s.checks, hints: totalHintUse(s.hintUse), noHint: isNoHintClear(s) }))
      }
      onNext={() => start(diff)}
      nextLabel="NEXT PUZZLE"
      headerRight={<span className="streak" title="Streak">🔥 {data.endlessStreak}</span>}
      footerExtra={<button className="btn" onClick={abandon}>NEW</button>}
    />
  );
}
