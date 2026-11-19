/**
 * Golden vectors for the Swift ART SLIDE port (run by `npm run ios:data` or `npx vite-node ios/scripts/export-art.ts`).
 * Writes ios/SlideKit/Tests/SlideCoreTests/Golden/art.json: puzzles (initial board + solution), the iOS daily, shuffles,
 * gallery filtering / grouping / sorting results and level lock rules, all produced by the WEB code.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ARTWORKS, getArtwork } from '../../src/games/art-slide/data';
import { ART_LEVELS, type ArtLevel } from '../../src/games/art-slide/logic/board';
import { DAILY_SIZE, generateArtPuzzle } from '../../src/games/art-slide/logic/generator';
import { dailyArtworkIdIos } from '../../src/games/art-slide/logic/dailyPickIos';
import { newArtGame, artReducer } from '../../src/games/art-slide/logic/game';
import { planReshuffle } from '../../src/games/art-slide/logic/reshuffle';
import { aspectOf, gridFor } from '../../src/games/art-slide/logic/grid';
import { filterArtworks, groupArtworks, homePicks, sortArtworks, type GroupBy, type SortBy } from '../../src/games/art-slide/logic/gallery';
import { FREE_ARTWORK_IDS, isFreeArtwork } from '../../src/premium/freeList';
import { FREE_MAX_LEVEL, isArtworkLocked, isLevelLocked } from '../../src/premium/entitlement';
import { dailyNumber } from '../../src/utils/date';

const ids = ['hokusai-great-wave', 'van-gogh-bedroom', 'monet-water-lilies', 'sargent-madame-x', 'aic-217536', 'aic-105466', 'hiroshige-arai', 'caillebotte-paris-street'];
const seeds = ['alpha', 'free|1731900000000-0.123', 'daily|2026-11-19', 'ü日本'];

const puzzles: unknown[] = [];
for (const artworkId of ids) for (const size of ART_LEVELS) for (const seed of seeds.slice(0, size === 3 ? 4 : 2)) {
  const p = generateArtPuzzle({ seed, id: `t-${artworkId}-${size}`, mode: 'endless', size, artworkId });
  puzzles.push({ seed, artworkId, size, aspect: aspectOf(getArtwork(artworkId)!), cols: p.cols, rows: p.rows, initial: p.initial, solution: p.solution });
}

const dates = ['2026-11-01', '2026-11-18', '2026-11-19', '2026-12-25', '2027-01-01', '2027-02-10', '2027-06-30', '2028-03-01'];
const daily = dates.map((date) => {
  const artworkId = dailyArtworkIdIos(date);
  const p = generateArtPuzzle({ seed: `daily|${date}`, id: `artdaily-${date}`, mode: 'daily', size: DAILY_SIZE, artworkId, number: dailyNumber(date) });
  return { date, artworkId, aspect: aspectOf(getArtwork(artworkId)!), number: p.number, cols: p.cols, rows: p.rows, initial: p.initial, solution: p.solution };
});

// SHUFFLE of a puzzle after some moves: new initial board, clicks, solution
const shuffles = ['hokusai-great-wave', 'aic-217536', 'monet-water-lilies'].map((artworkId, k) => {
  const puzzle = generateArtPuzzle({ seed: `sh${k}`, id: `s${k}`, mode: k === 1 ? 'daily' : 'endless', size: (3 + k) as ArtLevel, artworkId, number: k === 1 ? 7 : undefined });
  let st = newArtGame(puzzle);
  const d = { cols: puzzle.cols, rows: puzzle.rows };
  for (let i = 0; i < 6 + k; i++) {
    const cell = (st.board.indexOf(null) + (i % 2 ? 1 : d.cols)) % st.board.length;
    st = artReducer(st, { type: 'move', cell });
    st = artReducer(st, { type: 'dir', dir: (['up', 'left', 'down', 'right'] as const)[i % 4] });
  }
  const plan = planReshuffle(st, `seed${k}`);
  return { artworkId, aspect: aspectOf(getArtwork(artworkId)!), puzzle: { id: puzzle.id, mode: puzzle.mode, size: puzzle.size, number: puzzle.number ?? null, initial: puzzle.initial, solution: puzzle.solution },
    played: { board: st.board, moves: st.moves, blankPath: st.blankPath },
    clicks: plan.clicks, newInitial: plan.puzzle.initial, newSolution: plan.puzzle.solution, newId: plan.puzzle.id, newMode: plan.puzzle.mode, newNumber: plan.puzzle.number ?? null };
});

const grids = [0.5, 0.66, 0.75, 1, 1.2, 1.5, 2, 3].map((aspect) => ({ aspect, levels: ART_LEVELS.map((l) => gridFor(aspect, l)) }));

const locked = (premium: boolean) => (a: { id: string }) => isArtworkLocked(a.id, premium, true);
const queries = ['', 'monet', 'VAN GOGH', 'cezanne landscape', 'japanese prints', '1880', 'oil canvas', 'zzzz'];
const filters = queries.map((q) => ({ q, ids: filterArtworks(ARTWORKS, q).map((a) => a.id) }));
const sorts = (['artist', 'title', 'year-asc', 'year-desc', 'random'] as SortBy[]).map((sortBy) => ({ sortBy, seed: 12345, ids: sortArtworks(ARTWORKS, sortBy, 12345).map((a) => a.id) }));
const groups: unknown[] = [];
for (const groupBy of ['none', 'era', 'theme'] as GroupBy[]) for (const sortBy of ['artist', 'random'] as SortBy[]) for (const premium of [false, true]) for (const q of ['', 'portrait']) {
  const gs = groupArtworks(filterArtworks(ARTWORKS, q), groupBy, sortBy, 4000000000, locked(premium));
  groups.push({ groupBy, sortBy, premium, q, seed: 4000000000, groups: gs.map((g) => ({ key: g.key, ids: g.items.map((a) => a.id) })) });
}
const free = FREE_ARTWORK_IDS.map((x) => x);
const picks = ['2026-11-19', '2027-03-03'].map((date) => ({ date, ids: homePicks(ARTWORKS.filter((a) => isFreeArtwork(a.id)), date).map((a) => a.id) }));
const rules = {
  freeMaxLevel: FREE_MAX_LEVEL,
  levels: ART_LEVELS.map((l) => ({ level: l, freeLocked: isLevelLocked(l, false, true), premiumLocked: isLevelLocked(l, true, true) })),
  artworks: ARTWORKS.slice(0, 60).map((a) => ({ id: a.id, freeLocked: isArtworkLocked(a.id, false, true), premiumLocked: isArtworkLocked(a.id, true, true) })),
};

mkdirSync('ios/SlideKit/Tests/SlideCoreTests/Golden', { recursive: true });
writeFileSync('ios/SlideKit/Tests/SlideCoreTests/Golden/art.json', JSON.stringify({ puzzles, daily, shuffles, grids, filters, sorts, groups, picks, rules, free, artworkCount: ARTWORKS.length }));
console.log(`export-art: ${puzzles.length} puzzles, ${daily.length} dailies, ${shuffles.length} shuffles, ${groups.length} grouping cases`);
