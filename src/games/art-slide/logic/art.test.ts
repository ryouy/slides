import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_SIZES, blankIndex, canMove, isSolved, isValidBoard, moveTile, neighbors, solvedBoard, tileForDirection } from './board';
import { DAILY_POOL_V1, DAILY_POOL_V2_FROM, dailyArtworkId, generateArtDaily, generateArtFree, shuffleBoard, validateArtPuzzle } from './generator';
import { artReducer, newArtGame } from './game';
import { tileBackground, tileRegion } from './tiles';
import { ARTWORKS, getArtwork, nextArtwork } from '../data';
import { DAILY_POOL_V2 } from '../data/daily-pools';
import { ERA_ORDER, THEME_ORDER, filterArtworks, groupArtworks, sortArtworks } from './gallery';
import { rngFromString } from '../../../utils/rng';
import { dailyNumber } from '../../../utils/date';

describe('board & movement', () => {
  it('builds 3x3, 4x4 and 5x5 boards with exactly one blank in the corner', () => {
    for (const n of ART_SIZES) {
      const b = solvedBoard(n);
      expect(b).toHaveLength(n * n);
      expect(b.filter((t) => t === null)).toHaveLength(1);
      expect(blankIndex(b)).toBe(n * n - 1);
      expect(isValidBoard(b, n)).toBe(true);
      expect(isSolved(b)).toBe(true);
    }
    expect([3, 4, 5].map((n) => solvedBoard(n).filter((t) => t !== null).length)).toEqual([8, 15, 24]);
  });
  it('only tiles orthogonally next to the blank move; no diagonals, no wrap-around', () => {
    const b = solvedBoard(3); // blank at 8
    expect(canMove(b, 3, 7)).toBe(true);
    expect(canMove(b, 3, 5)).toBe(true);
    expect(canMove(b, 3, 4)).toBe(false); // diagonal
    expect(canMove(b, 3, 6)).toBe(false); // same row, not adjacent
    expect(canMove(b, 3, 8)).toBe(false); // the blank itself
    expect(moveTile(b, 3, 4)).toBeNull();
    expect(neighbors(2, 3)).not.toContain(3); // end of row 0 does not wrap to start of row 1
  });
  it('moves one tile, keeps every tile exactly once, never mutates', () => {
    const b = solvedBoard(4);
    const m = moveTile(b, 4, 14)!;
    expect(blankIndex(m)).toBe(14);
    expect(isValidBoard(m, 4)).toBe(true);
    expect(isSolved(m)).toBe(false);
    expect(blankIndex(b)).toBe(15);
  });
  it('maps directions to tiles', () => {
    const b = solvedBoard(3);
    expect(tileForDirection(b, 3, 'right')).toBe(7);
    expect(tileForDirection(b, 3, 'down')).toBe(5);
    expect(tileForDirection(b, 3, 'left')).toBeNull();
    expect(tileForDirection(b, 3, 'up')).toBeNull();
  });
  it('is solved only with every tile home AND the blank bottom-right', () => {
    const b = solvedBoard(3);
    expect(isSolved(b)).toBe(true);
    expect(isSolved(moveTile(b, 3, 7)!)).toBe(false);
    const swapped = b.slice();
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(isSolved(swapped)).toBe(false);
  });
});

describe('puzzle generation', () => {
  it('always yields solvable, unsolved boards for every size', () => {
    for (const n of ART_SIZES) {
      for (let i = 0; i < 40; i++) {
        const p = generateArtFree('van-gogh-bedroom', n, `s${n}-${i}`);
        expect(validateArtPuzzle(p)).toBe(true);
        expect(isValidBoard(p.initial, n)).toBe(true);
        expect(isSolved(p.initial)).toBe(false);
        let s = newArtGame(p);
        for (const c of p.solution) s = artReducer(s, { type: 'move', cell: c });
        expect(s.status).toBe('cleared');
        expect(s.moves).toBe(p.solution.length);
      }
    }
  });
  it('is deterministic per seed and differs between seeds', () => {
    const rng1 = rngFromString('x');
    const rng2 = rngFromString('x');
    expect(shuffleBoard(rng1, 4)).toEqual(shuffleBoard(rng2, 4));
    expect(generateArtFree('a', 3, 'q').initial).toEqual(generateArtFree('a', 3, 'q').initial);
    expect(generateArtFree('a', 5, 'q1').initial).not.toEqual(generateArtFree('a', 5, 'q2').initial);
  });
  it('daily: same date = same artwork and board, 4x4, number from the epoch, frozen pool is valid', () => {
    const a = generateArtDaily('2026-11-13');
    expect(a).toEqual(generateArtDaily('2026-11-13'));
    expect([a.size, a.number, a.mode]).toEqual([4, 13, 'daily']);
    expect(getArtwork(a.artworkId)).toBeDefined();
    expect(new Set(DAILY_POOL_V1).size).toBe(DAILY_POOL_V1.length);
    for (const id of DAILY_POOL_V1) expect(getArtwork(id), id).toBeDefined();
    // the 13 days served from pool V1 (2026-11-01 .. 11-13) are all different works from that pool
    const v1days = Array.from({ length: 13 }, (_, i) => dailyArtworkId(new Date(Date.parse('2026-11-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10)));
    expect(new Set(v1days).size).toBe(13);
    v1days.forEach((id) => expect(DAILY_POOL_V1).toContain(id));
    expect(dailyNumber('2026-11-01')).toBe(1);
  });
  it('daily outputs are frozen (regression guard for published puzzles)', () => {
    expect(dailyArtworkId('2026-11-13')).toMatchInlineSnapshot(`"hokusai-shower-below-the-summit"`);
    expect(generateArtDaily('2026-11-13').initial.join(',')).toMatchInlineSnapshot(`"13,8,0,10,6,9,7,4,14,5,12,2,11,1,3,"`);
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

describe('game reducer', () => {
  const near = () => {
    const p = generateArtFree('x', 3, 'near');
    return { ...p, initial: moveTile(solvedBoard(3), 3, 7)!, solution: [8] };
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

describe('image slicing', () => {
  /** What a tile box shows when CSS applies size/position, in source-image fractions. */
  function cssRegion(w: number, h: number, n: number, row: number, col: number, focus: { x: number; y: number }) {
    const { W, H, px, py } = tileBackground(w, h, n, row, col, focus);
    const offX = (1 - W) * (px / 100); // CSS background-position percentage rule
    const offY = (1 - H) * (py / 100);
    return { x0: -offX / W, x1: (-offX + 1) / W, y0: -offY / H, y1: (-offY + 1) / H };
  }
  const shapes: [number, number][] = [[1200, 800], [800, 1200], [1000, 1000], [1400, 941], [818, 1400]];
  it('CSS background maths shows exactly the intended region for every tile, sizes and aspect ratios', () => {
    for (const [w, h] of shapes) {
      for (const n of ART_SIZES) {
        for (const focus of [{ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.8 }, { x: 0, y: 1 }]) {
          for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
              const want = tileRegion(w, h, n, r, c, focus);
              const got = cssRegion(w, h, n, r, c, focus);
              for (const k of ['x0', 'x1', 'y0', 'y1'] as const) expect(got[k]).toBeCloseTo(want[k], 9);
            }
          }
        }
      }
    }
  });
  it('tiles join up: neighbouring regions share an edge and all tiles cover the square crop exactly once', () => {
    for (const [w, h] of shapes) {
      const n = 4;
      const s = Math.min(w, h);
      let area = 0;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const a = tileRegion(w, h, n, r, c);
          area += (a.x1 - a.x0) * w * ((a.y1 - a.y0) * h);
          if (c < n - 1) expect(a.x1).toBeCloseTo(tileRegion(w, h, n, r, c + 1).x0, 12);
          if (r < n - 1) expect(a.y1).toBeCloseTo(tileRegion(w, h, n, r + 1, c).y0, 12);
        }
      }
      expect(area).toBeCloseTo(s * s, 4);
    }
  });
  it('never stretches: the scaled image keeps its aspect ratio and the crop is square', () => {
    for (const [w, h] of shapes) {
      const bg = tileBackground(w, h, 5, 2, 3);
      expect(bg.W / bg.H).toBeCloseTo(w / h, 9);
      const reg = tileRegion(w, h, 5, 2, 3);
      expect((reg.x1 - reg.x0) * w).toBeCloseTo((reg.y1 - reg.y0) * h, 9); // square tile in source pixels
    }
  });
  it('a tile always shows the same region, wherever it sits (the region depends only on its home cell)', () => {
    const p = generateArtFree('x', 4, 'img');
    const home = (id: number) => tileRegion(1200, 800, 4, Math.floor(id / 4), id % 4);
    let s = newArtGame(p);
    const before = s.board.map((t) => (t === null ? null : home(t)));
    s = artReducer(s, { type: 'move', cell: p.solution[0] });
    const after = s.board.map((t) => (t === null ? null : home(t)));
    const ids = (b: typeof before) => b.filter(Boolean).map((r) => JSON.stringify(r)).sort();
    expect(ids(after)).toEqual(ids(before));
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
  it('ships every image and thumbnail, with dimensions and a valid crop focus', () => {
    for (const a of ARTWORKS) {
      expect(fs.statSync(`public${a.imageUrl}`).size, a.imageUrl).toBeGreaterThan(5000);
      expect(fs.statSync(`public${a.thumbnailUrl}`).size, a.thumbnailUrl).toBeGreaterThan(1000);
      expect(fs.statSync(`public${a.imageUrl}`).size, a.imageUrl).toBeLessThan(2_000_000); // keeps pages light
      expect(a.width).toBeGreaterThan(300);
      expect(a.height).toBeGreaterThan(300);
      expect(a.focus.x).toBeGreaterThanOrEqual(0);
      expect(a.focus.x).toBeLessThanOrEqual(1);
      expect(a.focus.y).toBeGreaterThanOrEqual(0);
      expect(a.focus.y).toBeLessThanOrEqual(1);
    }
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
