import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_LEVELS, blankIndex, canMove, isSolved, isValidBoard, moveTile, neighbors, solvedBoard, tileForDirection, type Dims } from './board';
import { DAILY_POOL_V1, DAILY_POOL_V2_FROM, dailyArtworkId, dimsForArtwork, generateArtDaily, generateArtFree, shuffleBoard, validateArtPuzzle } from './generator';
import { artReducer, newArtGame } from './game';
import { gridFor } from './grid';
import { planReshuffle, reduceBlankPath } from './reshuffle';
import { tileBackground, tileRegion } from './tiles';
import { ARTWORKS, getArtwork, nextArtwork, pickRandomArtwork } from '../data';
import { DAILY_POOL_V2 } from '../data/daily-pools';
import { ERA_ORDER, THEME_ORDER, filterArtworks, groupArtworks, sortArtworks } from './gallery';
import { rngFromString } from '../../../utils/rng';
import { dailyNumber } from '../../../utils/date';

const sq = (n: number): Dims => ({ cols: n, rows: n });
const grids: Dims[] = [sq(3), sq(4), sq(5), { cols: 4, rows: 3 }, { cols: 2, rows: 4 }, { cols: 6, rows: 4 }];

describe('board & movement (any grid)', () => {
  it('builds boards with exactly one blank in the bottom-right corner', () => {
    for (const d of grids) {
      const b = solvedBoard(d);
      expect(b).toHaveLength(d.cols * d.rows);
      expect(b.filter((t) => t === null)).toHaveLength(1);
      expect(blankIndex(b)).toBe(d.cols * d.rows - 1);
      expect(isValidBoard(b, d)).toBe(true);
      expect(isSolved(b)).toBe(true);
    }
    expect([3, 4, 5].map((n) => solvedBoard(sq(n)).filter((t) => t !== null).length)).toEqual([8, 15, 24]);
  });
  it('only tiles orthogonally next to the blank move; no diagonals, no wrap-around, also on rectangular grids', () => {
    const d: Dims = { cols: 4, rows: 3 };
    const b = solvedBoard(d); // blank at 11
    expect(canMove(b, d, 10)).toBe(true);
    expect(canMove(b, d, 7)).toBe(true);
    expect(canMove(b, d, 6)).toBe(false); // diagonal
    expect(canMove(b, d, 8)).toBe(false); // same row, not adjacent
    expect(canMove(b, d, 11)).toBe(false); // the blank itself
    expect(moveTile(b, d, 6)).toBeNull();
    expect(neighbors(3, d)).not.toContain(4); // end of row 0 does not wrap to the start of row 1
    expect(neighbors(0, d).sort()).toEqual([1, 4]);
  });
  it('moves one tile, keeps every tile exactly once, never mutates', () => {
    const d = sq(4);
    const b = solvedBoard(d);
    const m = moveTile(b, d, 14)!;
    expect(blankIndex(m)).toBe(14);
    expect(isValidBoard(m, d)).toBe(true);
    expect(isSolved(m)).toBe(false);
    expect(blankIndex(b)).toBe(15);
  });
  it('maps directions to tiles', () => {
    const d: Dims = { cols: 3, rows: 2 };
    const b = solvedBoard(d); // blank at 5
    expect(tileForDirection(b, d, 'right')).toBe(4);
    expect(tileForDirection(b, d, 'down')).toBe(2);
    expect(tileForDirection(b, d, 'left')).toBeNull();
    expect(tileForDirection(b, d, 'up')).toBeNull();
  });
  it('is solved only with every tile home AND the blank bottom-right', () => {
    const d = sq(3);
    const b = solvedBoard(d);
    expect(isSolved(b)).toBe(true);
    expect(isSolved(moveTile(b, d, 7)!)).toBe(false);
    const swapped = b.slice();
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(isSolved(swapped)).toBe(false);
  });
});

describe('grid follows the painting (no cropping)', () => {
  it('square paintings get square grids; wide ones get more columns; tall ones more rows', () => {
    expect(gridFor(1, 3)).toEqual(sq(3));
    expect(gridFor(1, 4)).toEqual(sq(4));
    expect(gridFor(1, 5)).toEqual(sq(5));
    const wide = gridFor(1.5, 4);
    expect(wide.cols).toBeGreaterThan(wide.rows);
    const tall = gridFor(0.6, 4);
    expect(tall.rows).toBeGreaterThan(tall.cols);
  });
  it('keeps tiles nearly square and the piece count near level², for every artwork and level', () => {
    for (const a of ARTWORKS) {
      for (const level of ART_LEVELS) {
        const d = gridFor(a.width / a.height, level);
        const tileAspect = (a.width / a.height) * (d.rows / d.cols);
        expect(tileAspect, `${a.id} L${level}`).toBeGreaterThan(0.72);
        expect(tileAspect, `${a.id} L${level}`).toBeLessThan(1.4);
        const count = d.cols * d.rows;
        expect(count).toBeGreaterThanOrEqual(6);
        expect(count / (level * level)).toBeGreaterThan(0.55);
        expect(count / (level * level)).toBeLessThan(1.8);
      }
    }
  });
  it('harder levels always have more pieces', () => {
    for (const a of ARTWORKS) {
      const counts = ART_LEVELS.map((l) => { const d = gridFor(a.width / a.height, l); return d.cols * d.rows; });
      expect(counts[0], a.id).toBeLessThan(counts[1]);
      expect(counts[1], a.id).toBeLessThan(counts[2]);
    }
  });
});

describe('puzzle generation', () => {
  it('always yields solvable, unsolved boards for every level and painting shape', () => {
    for (const id of ['van-gogh-bedroom', 'sargent-madame-x', 'hokusai-great-wave', 'monet-water-lilies']) {
      for (const level of ART_LEVELS) {
        for (let i = 0; i < 6; i++) {
          const p = generateArtFree(id, level, `s${level}-${i}`);
          const d = { cols: p.cols, rows: p.rows };
          expect(d).toEqual(dimsForArtwork(id, level));
          expect(validateArtPuzzle(p)).toBe(true);
          expect(isValidBoard(p.initial, d)).toBe(true);
          expect(isSolved(p.initial)).toBe(false);
          let s = newArtGame(p);
          for (const c of p.solution) s = artReducer(s, { type: 'move', cell: c });
          expect(s.status).toBe('cleared');
          expect(s.moves).toBe(p.solution.length);
        }
      }
    }
  });
  it('is deterministic per seed and differs between seeds', () => {
    const d = sq(4);
    expect(shuffleBoard(rngFromString('x'), 4, d)).toEqual(shuffleBoard(rngFromString('x'), 4, d));
    expect(generateArtFree('a', 3, 'q').initial).toEqual(generateArtFree('a', 3, 'q').initial);
    expect(generateArtFree('a', 5, 'q1').initial).not.toEqual(generateArtFree('a', 5, 'q2').initial);
  });
  it('daily: same date = same artwork and board, normal level, number from the epoch, frozen pool is valid', () => {
    const a = generateArtDaily('2026-11-13');
    expect(a).toEqual(generateArtDaily('2026-11-13'));
    expect([a.size, a.number, a.mode]).toEqual([4, 13, 'daily']);
    expect(getArtwork(a.artworkId)).toBeDefined();
    expect({ cols: a.cols, rows: a.rows }).toEqual(dimsForArtwork(a.artworkId, 4));
    expect(new Set(DAILY_POOL_V1).size).toBe(DAILY_POOL_V1.length);
    for (const id of DAILY_POOL_V1) expect(getArtwork(id), id).toBeDefined();
    const v1days = Array.from({ length: 13 }, (_, i) => dailyArtworkId(new Date(Date.parse('2026-11-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10)));
    expect(new Set(v1days).size).toBe(13);
    v1days.forEach((id) => expect(DAILY_POOL_V1).toContain(id));
    expect(dailyNumber('2026-11-01')).toBe(1);
  });
  it('daily outputs are frozen (regression guard for published puzzles)', () => {
    expect(dailyArtworkId('2026-11-13')).toBe('hokusai-shower-below-the-summit');
    expect(generateArtDaily('2026-11-13').initial.join(',')).toMatchInlineSnapshot(`"14,0,21,18,2,8,15,7,9,,1,5,12,6,13,10,4,17,19,20,22,11,3,16"`);
    expect(`${generateArtDaily('2026-11-13').cols}x${generateArtDaily('2026-11-13').rows}`).toMatchInlineSnapshot(`"6x4"`);
  });
});

describe('game reducer', () => {
  const near = () => {
    const p = generateArtFree('x', 3, 'near');
    return { ...p, initial: moveTile(solvedBoard(sq(3)), sq(3), 7)!, solution: [8] };
  };
  it('starts the timer at the first legal move only, counts moves, clears on the last, then locks', () => {
    let s = newArtGame(near());
    expect(artReducer(s, { type: 'tick', ms: 100 }).elapsedMs).toBe(0);
    expect(artReducer(s, { type: 'move', cell: 0 })).toBe(s); // illegal: nothing happens
    expect(artReducer(s, { type: 'move', cell: 0 }).started).toBe(false);
    s = artReducer(s, { type: 'move', cell: 8 });
    expect(s).toMatchObject({ status: 'cleared', moves: 1, started: true });
    const t = s.elapsedMs;
    expect(artReducer(s, { type: 'tick', ms: 500 }).elapsedMs).toBe(t);
    expect(artReducer(s, { type: 'move', cell: 7 })).toBe(s);
  });
  it('restart returns to the same initial arrangement', () => {
    const p = generateArtFree('x', 4, 'r');
    let s = newArtGame(p);
    s = artReducer(s, { type: 'move', cell: p.solution[0] });
    s = artReducer(s, { type: 'restart' });
    expect(s.board).toEqual(p.initial);
    expect([s.moves, s.elapsedMs, s.started]).toEqual([0, 0, false]);
  });
});

describe('SHUFFLE (a real sequence of slides)', () => {
  const stepThrough = (s0: ReturnType<typeof newArtGame>, clicks: number[]) => clicks.reduce((s, cell) => artReducer(s, { type: 'slideStep', cell }), s0);
  it("every planned slide is legal and ends exactly on the new puzzle's initial board", () => {
    for (const id of ['van-gogh-bedroom', 'sargent-madame-x']) {
      for (const level of ART_LEVELS) {
        for (let i = 0; i < 8; i++) {
          const s0 = newArtGame(generateArtFree(id, level, `sh-${level}-${i}`));
          const d = { cols: s0.puzzle.cols, rows: s0.puzzle.rows };
          const plan = planReshuffle(s0, `seed-${i}`);
          expect(plan.clicks.length).toBeGreaterThanOrEqual(15);
          let b = s0.board;
          for (const c of plan.clicks) {
            expect(canMove(b, d, c)).toBe(true);
            b = moveTile(b, d, c)!;
          }
          expect(b).toEqual(plan.puzzle.initial);
          expect(isSolved(plan.puzzle.initial)).toBe(false);
          expect(isValidBoard(plan.puzzle.initial, d)).toBe(true);
          expect(stepThrough(s0, plan.clicks).board).toEqual(plan.puzzle.initial);
          expect([plan.puzzle.cols, plan.puzzle.rows]).toEqual([d.cols, d.rows]);
        }
      }
    }
  });
  it('the new puzzle is solvable and its stored solution works, even after moves and repeated shuffles', () => {
    for (const level of ART_LEVELS) {
      let s = newArtGame(generateArtFree('monet-water-lilies', level, `rep-${level}`));
      for (let round = 0; round < 3; round++) {
        for (const c of s.puzzle.solution.slice(0, 3)) s = artReducer(s, { type: 'move', cell: c });
        const plan = planReshuffle(s, `r${round}`);
        s = artReducer(stepThrough(s, plan.clicks), { type: 'reshuffled', puzzle: plan.puzzle });
        expect(validateArtPuzzle(plan.puzzle)).toBe(true);
        expect([s.moves, s.elapsedMs, s.started, s.status]).toEqual([0, 0, false, 'playing']);
        expect(s.board).toEqual(plan.puzzle.initial);
      }
      for (const c of s.puzzle.solution) s = artReducer(s, { type: 'move', cell: c });
      expect(s.status).toBe('cleared');
    }
  });
  it('works from a finished board (PLAY AGAIN) and does not count moves', () => {
    const p = generateArtFree('x', 3, 'fin');
    let s = newArtGame(p);
    for (const c of p.solution) s = artReducer(s, { type: 'move', cell: c });
    expect(s.status).toBe('cleared');
    const plan = planReshuffle(s, 'again');
    const mid = artReducer(s, { type: 'slideStep', cell: plan.clicks[0] });
    expect(mid.status).toBe('playing');
    expect(mid.moves).toBe(s.moves);
    const end = artReducer(stepThrough(s, plan.clicks), { type: 'reshuffled', puzzle: plan.puzzle });
    expect(validateArtPuzzle(end.puzzle)).toBe(true);
  });
  it('is deterministic for a seed; an illegal slide changes nothing', () => {
    const s0 = newArtGame(generateArtFree('x', 4, 'det'));
    expect(planReshuffle(s0, 'a')).toEqual(planReshuffle(s0, 'a'));
    expect(planReshuffle(s0, 'a').clicks).not.toEqual(planReshuffle(s0, 'b').clicks);
    const blank = s0.board.indexOf(null);
    const far = s0.board.findIndex((_, c) => c !== blank && !canMove(s0.board, { cols: 4, rows: 4 }, c));
    expect(artReducer(s0, { type: 'slideStep', cell: far })).toBe(s0);
  });
  it('the stored solution stays short: back-and-forth is cancelled', () => {
    expect(reduceBlankPath([8, 7, 8, 5, 4, 5, 2])).toEqual([8, 5, 2]);
    expect(reduceBlankPath([1, 2, 3])).toEqual([1, 2, 3]);
    let s = newArtGame(generateArtFree('x', 4, 'len'));
    let naive = s.puzzle.solution.length;
    for (let r = 0; r < 6; r++) {
      for (const c of s.puzzle.solution.slice(0, 3)) s = artReducer(s, { type: 'move', cell: c }); // moves along the way home cancel out
      const plan = planReshuffle(s, `len${r}`);
      naive += 3 + plan.clicks.length;
      s = artReducer(plan.clicks.reduce((st, cell) => artReducer(st, { type: 'slideStep', cell }), s), { type: 'reshuffled', puzzle: plan.puzzle });
      expect(validateArtPuzzle(s.puzzle)).toBe(true);
    }
    expect(s.puzzle.solution.length).toBeLessThan(naive);
  });
});

describe('image slicing (the whole painting, no cropping)', () => {
  /** What a tile box shows when CSS applies size/position, as fractions of the whole image. */
  function cssRegion(d: Dims, row: number, col: number) {
    const { W, H, px, py } = tileBackground(d, row, col);
    const offX = (1 - W) * (px / 100); // CSS background-position percentage rule
    const offY = (1 - H) * (py / 100);
    return { x0: -offX / W, x1: (-offX + 1) / W, y0: -offY / H, y1: (-offY + 1) / H };
  }
  it('CSS background maths shows exactly the intended region for every tile of every grid', () => {
    for (const d of grids) {
      for (let r = 0; r < d.rows; r++) {
        for (let c = 0; c < d.cols; c++) {
          const want = tileRegion(d, r, c);
          const got = cssRegion(d, r, c);
          for (const k of ['x0', 'x1', 'y0', 'y1'] as const) expect(got[k]).toBeCloseTo(want[k], 9);
        }
      }
    }
  });
  it('tiles join up and together cover the entire image exactly once', () => {
    for (const d of grids) {
      let area = 0;
      for (let r = 0; r < d.rows; r++) {
        for (let c = 0; c < d.cols; c++) {
          const a = tileRegion(d, r, c);
          area += (a.x1 - a.x0) * (a.y1 - a.y0);
          if (c < d.cols - 1) expect(a.x1).toBeCloseTo(tileRegion(d, r, c + 1).x0, 12);
          if (r < d.rows - 1) expect(a.y1).toBeCloseTo(tileRegion(d, r + 1, c).y0, 12);
        }
      }
      expect(area).toBeCloseTo(1, 12);
      expect(tileRegion(d, 0, 0).x0).toBe(0);
      expect(tileRegion(d, d.rows - 1, d.cols - 1).y1).toBe(1);
    }
  });
  it('a tile always shows the same region, wherever it sits', () => {
    const p = generateArtFree('van-gogh-bedroom', 4, 'img');
    const d = { cols: p.cols, rows: p.rows };
    const home = (id: number) => tileRegion(d, Math.floor(id / d.cols), id % d.cols);
    let s = newArtGame(p);
    const before = s.board.map((t) => (t === null ? null : home(t)));
    s = artReducer(s, { type: 'move', cell: p.solution[0] });
    const after = s.board.map((t) => (t === null ? null : home(t)));
    const ids = (b: typeof before) => b.filter(Boolean).map((r) => JSON.stringify(r)).sort();
    expect(ids(after)).toEqual(ids(before));
  });
});

describe('daily pool V2 (from 2026-11-14)', () => {
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  it('is frozen, valid and unique', () => {
    expect(DAILY_POOL_V2.length).toBeGreaterThanOrEqual(100);
    expect(new Set(DAILY_POOL_V2).size).toBe(DAILY_POOL_V2.length);
    for (const id of DAILY_POOL_V2) expect(getArtwork(id), id).toBeDefined();
  });
  it('switches pools at the activation date and keeps older days unchanged', () => {
    expect(DAILY_POOL_V2_FROM).toBe('2026-11-14');
    expect(DAILY_POOL_V1).toContain(dailyArtworkId('2026-11-13'));
    expect(DAILY_POOL_V2).toContain(dailyArtworkId('2026-11-14'));
    expect(dailyArtworkId('2026-11-13')).toBe('hokusai-shower-below-the-summit'); // published before V2: never changes
    expect(dailyArtworkId('2026-11-14')).toMatchInlineSnapshot(`"hokusai-hara"`);
    expect(dailyArtworkId('2027-01-05')).toMatchInlineSnapshot(`"church-view-of-cotopaxi"`);
  });
  it('shows every painting once per cycle and is deterministic', () => {
    const n = DAILY_POOL_V2.length;
    const ids = Array.from({ length: n }, (_, i) => dailyArtworkId(addDays(DAILY_POOL_V2_FROM, i)));
    expect(new Set(ids).size).toBe(n);
    expect(dailyArtworkId('2026-12-25')).toBe(dailyArtworkId('2026-12-25'));
    expect(generateArtDaily('2026-12-25')).toEqual(generateArtDaily('2026-12-25'));
  });
});

describe('artwork data & rights', () => {
  it('has about 100 works with unique ids', () => {
    expect(ARTWORKS.length).toBeGreaterThanOrEqual(100);
    expect(ARTWORKS.length).toBeLessThanOrEqual(110);
    expect(new Set(ARTWORKS.map((a) => a.id)).size).toBe(ARTWORKS.length);
  });
  it('records source, licence and verification for every work, and only open licences', () => {
    for (const a of ARTWORKS) {
      for (const k of ['title', 'artist', 'artistSort', 'year', 'era', 'theme', 'medium', 'museum', 'sourceUrl', 'license', 'licenseUrl', 'licenseBasis', 'sourceImageUrl', 'verifiedAt', 'description'] as const) expect(a[k], `${a.id}.${k}`).toBeTruthy();
      expect(a.license).toMatch(/CC0/);
      expect(a.licenseBasis).toMatch(/is_public_domain = true|isPublicDomain = true/);
      expect(a.licenseUrl).toMatch(/^https:\/\//);
      expect(a.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (a.museum === 'Art Institute of Chicago') {
        expect(a.sourceUrl).toMatch(/^https:\/\/www\.artic\.edu\/artworks\/\d+$/);
        expect(a.sourceImageUrl).toMatch(/^https:\/\/www\.artic\.edu\/iiif\/2\//);
      } else {
        expect(a.museum).toBe('The Metropolitan Museum of Art');
        expect(a.sourceUrl).toMatch(/^https:\/\/www\.metmuseum\.org\//);
        expect(a.sourceImageUrl).toMatch(/^https:\/\/images\.metmuseum\.org\//);
      }
    }
  });
  it('has original short descriptions, no copied museum text markers', () => {
    for (const a of ARTWORKS) {
      expect(a.description.length).toBeGreaterThan(40);
      expect(a.description.length).toBeLessThan(260);
      expect(a.description).not.toMatch(/https?:|©|\bcopyright\b/i);
      expect(a.description).not.toMatch(/undefined|null|NaN/);
    }
  });
  it('ships every image and thumbnail, with dimensions', () => {
    for (const a of ARTWORKS) {
      expect(fs.statSync(`public${a.imageUrl}`).size, a.imageUrl).toBeGreaterThan(5000);
      expect(fs.statSync(`public${a.thumbnailUrl}`).size, a.thumbnailUrl).toBeGreaterThan(1000);
      expect(fs.statSync(`public${a.imageUrl}`).size, a.imageUrl).toBeLessThan(2_000_000); // keeps pages light
      expect(a.width).toBeGreaterThan(300);
      expect(a.height).toBeGreaterThan(300);
    }
  });
  it('pickRandomArtwork covers the whole list, never returns the excluded painting', () => {
    const first = ARTWORKS[0].id;
    expect(pickRandomArtwork(first, () => 0).id).toBe(ARTWORKS[1].id); // skips the excluded one
    expect(pickRandomArtwork(undefined, () => 0).id).toBe(first);
    expect(pickRandomArtwork(undefined, () => 0.9999999).id).toBe(ARTWORKS[ARTWORKS.length - 1].id);
    const seen = new Set<string>();
    const rng = rngFromString('random-pick');
    for (let i = 0; i < 400; i++) {
      const a = pickRandomArtwork('van-gogh-bedroom', rng);
      expect(a.id).not.toBe('van-gogh-bedroom');
      seen.add(a.id);
    }
    expect(seen.size).toBeGreaterThan(60);
  });
  it('includes both landscape and portrait works; nextArtwork wraps around', () => {
    expect(ARTWORKS.some((a) => a.width > a.height * 1.2)).toBe(true);
    expect(ARTWORKS.some((a) => a.height > a.width * 1.2)).toBe(true);
    expect(nextArtwork(ARTWORKS[ARTWORKS.length - 1].id).id).toBe(ARTWORKS[0].id);
  });
});

describe('gallery: search, sort and grouping', () => {
  it('every work has a known theme and era; every theme has works', () => {
    for (const a of ARTWORKS) {
      expect(THEME_ORDER, `${a.id} theme ${a.theme}`).toContain(a.theme);
      expect(ERA_ORDER, `${a.id} era ${a.era}`).toContain(a.era);
      expect(Number.isFinite(a.yearStart)).toBe(true);
      expect(a.yearEnd).toBeGreaterThanOrEqual(a.yearStart);
    }
    for (const t of THEME_ORDER) expect(ARTWORKS.some((a) => a.theme === t), t).toBe(true);
  });
  it('searches title, artist, theme and era, ignoring case and accents, all words must match', () => {
    const monet = filterArtworks(ARTWORKS, 'MONET');
    expect(monet.length).toBeGreaterThanOrEqual(3);
    expect(monet.every((a) => /monet/i.test(a.artist))).toBe(true);
    expect(filterArtworks(ARTWORKS, 'cezanne').some((a) => a.artist === 'Paul Cézanne')).toBe(true);
    expect(filterArtworks(ARTWORKS, 'monet water').every((a) => /monet/i.test(a.artist) && /water/i.test(`${a.title} ${a.theme}`))).toBe(true);
    expect(filterArtworks(ARTWORKS, 'japanese prints').length).toBe(ARTWORKS.filter((a) => a.theme === 'Japanese Prints').length);
    expect(filterArtworks(ARTWORKS, '')).toHaveLength(ARTWORKS.length);
    expect(filterArtworks(ARTWORKS, 'zzzz-no-match')).toHaveLength(0);
  });
  it('sorts by artist, title and year', () => {
    const asc = sortArtworks(ARTWORKS, 'year-asc').map((a) => a.yearStart);
    expect(asc).toEqual([...asc].sort((x, y) => x - y));
    const desc = sortArtworks(ARTWORKS, 'year-desc').map((a) => a.yearStart);
    expect(desc).toEqual([...desc].sort((x, y) => y - x));
    const titles = sortArtworks(ARTWORKS, 'title').map((a) => a.title);
    expect(titles).toEqual([...titles].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' })));
    const artists = sortArtworks(ARTWORKS, 'artist').map((a) => a.artistSort);
    expect(artists).toEqual([...artists].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' })));
  });
  it('groups every work exactly once, in a sensible group order', () => {
    for (const by of ['none', 'theme', 'era', 'artist'] as const) {
      const groups = groupArtworks(ARTWORKS, by, 'year-asc');
      const ids = groups.flatMap((g) => g.items.map((a) => a.id));
      expect(ids.sort()).toEqual(ARTWORKS.map((a) => a.id).sort());
      expect(groups.every((g) => g.items.length > 0)).toBe(true);
    }
    expect(groupArtworks(ARTWORKS, 'none', 'title')).toHaveLength(1);
    const eras = groupArtworks(ARTWORKS, 'era', 'title').map((g) => g.label);
    expect(eras).toEqual(ERA_ORDER.filter((e) => eras.includes(e))); // chronological
    const themes = groupArtworks(ARTWORKS, 'theme', 'title').map((g) => g.label);
    expect(themes).toEqual(THEME_ORDER.filter((t) => themes.includes(t)));
    const artistGroups = groupArtworks(ARTWORKS, 'artist', 'title');
    expect(artistGroups.length).toBeGreaterThanOrEqual(40);
    const keys = artistGroups.map((g) => g.items[0].artistSort);
    expect(keys).toEqual([...keys].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' })));
    // sort applies inside each group
    for (const g of groupArtworks(ARTWORKS, 'theme', 'year-asc')) {
      const ys = g.items.map((a) => a.yearStart);
      expect(ys).toEqual([...ys].sort((x, y) => x - y));
    }
  });
  it('grouping respects the search filter', () => {
    const groups = groupArtworks(filterArtworks(ARTWORKS, 'van gogh'), 'theme', 'year-asc');
    expect(groups.flatMap((g) => g.items).every((a) => /van gogh/i.test(a.artist))).toBe(true);
  });
});
