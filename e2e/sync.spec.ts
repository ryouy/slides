import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/** Google Drive sync against a fake Google (sign-in script + Drive). No real Google or Drive is touched. */
const GIS = `window.google = { accounts: { oauth2: {
  initTokenClient: (c) => (window.__hint = c.hint, { requestAccessToken: () => setTimeout(() => (window.__tokenFails ? c.error_callback && c.error_callback({}) : c.callback({ access_token: 'fake-token', expires_in: 3600 })), 5) }),
  revoke: (t, done) => { window.__revoked = (window.__revoked || 0) + 1; done && done(); } } } };`;

const LEGACY = {
  version: 1, completed: 7, lastSize: 3, showNumbers: false,
  dailyHistory: {}, bests: { '3': { timeMs: 50000, moves: 80 } },
  history: [{ date: '2026-11-15', mode: 'endless', size: 3, artworkId: 'monet-water-lilies', timeMs: 50000, moves: 80 }],
};

function fakeDrive() {
  const st = { file: null as string | null, writes: 0, fail: 0, tokens: [] as string[] };
  const handler = async (route: import('@playwright/test').Route) => {
    const req = route.request();
    const url = req.url();
    st.tokens.push(req.headers()['authorization'] ?? '');
    if (st.fail) return route.fulfill({ status: st.fail, body: '{}' });
    const ok = (b: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(b), headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/upload/') && req.method() === 'POST') { st.file = req.postData()!.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]; st.writes++; return ok({ id: 'f1' }); }
    if (url.includes('/upload/') && req.method() === 'PATCH') { st.file = req.postData()!; st.writes++; return ok({}); }
    if (url.includes('alt=media')) return route.fulfill({ body: st.file ?? '', headers: { 'access-control-allow-origin': '*' } });
    if (url.includes('spaces=appDataFolder')) return ok({ files: st.file ? [{ id: 'f1' }] : [] });
    return route.fulfill({ status: 404, body: '{}' });
  };
  return { st, handler };
}

async function setup(ctxOrPage: Page, drive: ReturnType<typeof fakeDrive>, me: object, save: object | null = LEGACY) {
  const page = ctxOrPage;
  await page.addInitScript((s) => {
    localStorage.setItem('slides:dev-gating', '1');
    localStorage.setItem('slides:dev-operator', '1');
    if (s && !localStorage.getItem('artslide:save')) localStorage.setItem('artslide:save', JSON.stringify(s));
  }, save);
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'application/javascript', body: GIS }));
  await page.route('https://www.googleapis.com/**', drive.handler);
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (b: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (path === '/api/config') return json({ auth: true, billing: true, purchases: true, googleClientId: 'client-id.apps.googleusercontent.com' });
    if (path === '/api/me') return json(me);
    if (path === '/api/auth/logout') return json({ ok: true });
    return route.fulfill({ status: 404, body: '{}' });
  });
}
const ME = { signedIn: true, id: 'user-1', googleSub: 'google-sub-1', premium: false, name: 'Ann Example', status: null };
const readSave = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('artslide:save') ?? '{}'));

test('turning sync on uploads the existing records to Drive and keeps every local one', async ({ page }) => {
  const d = fakeDrive();
  await setup(page, d, ME);
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('sync')).toBeVisible();
  await expect(page.getByTestId('sync-status')).toHaveCount(0); // off until asked
  await page.getByTestId('sync-enable').click();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');
  const doc = JSON.parse(d.st.file!);
  expect(doc.schema).toBe(2); // 2 = the document now carries favourites
  expect(Object.values(doc.counters)).toEqual([7]); // the 7 existing clears
  expect(doc.bests['3']).toEqual({ timeMs: 50000, moves: 80 });
  expect(doc.records['monet-water-lilies:3']).toMatchObject({ bestTimeMs: 50000, bestMoves: 80 });
  expect(JSON.stringify(doc)).not.toMatch(/premium|stripe|subscription|status/i); // records only, never the plan
  expect(d.st.tokens.every((t) => t === 'Bearer fake-token')).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __hint?: string }).__hint)).toBe('google-sub-1'); // Google is asked about the account signed in here
  const local = await readSave(page);
  expect(local.completed).toBe(7);
  expect(local.bests['3']).toEqual({ timeMs: 50000, moves: 80 });
  expect(await page.evaluate(() => localStorage.getItem('artslide:save:before-sync'))).toContain('"completed":7'); // safety copy
});

test('a second device gets the records; both devices then agree and nothing is counted twice', async ({ browser }) => {
  const d = fakeDrive();
  const ctxA: BrowserContext = await browser.newContext();
  const a = await ctxA.newPage();
  await setup(a, d, ME);
  await a.goto('/art-slide/account');
  await a.getByTestId('sync-enable').click();
  await expect(a.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await setup(b, d, ME, { ...LEGACY, completed: 2, bests: { '3': { timeMs: 40000, moves: 95 } }, history: [] });
  await b.goto('/art-slide/account');
  await b.getByTestId('sync-enable').click();
  await expect(b.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');
  const sb = await readSave(b);
  expect(sb.completed).toBe(9); // 7 from A + 2 of its own
  expect(sb.bests['3']).toEqual({ timeMs: 40000, moves: 80 }); // the better of each

  await a.getByTestId('sync-now').click();
  await expect(a.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');
  expect((await readSave(a)).completed).toBe(9);
  await a.getByTestId('sync-now').click(); // again: still 9
  await expect(a.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');
  expect((await readSave(a)).completed).toBe(9);
  await ctxA.close();
  await ctxB.close();
});

test('a Drive failure never costs a record, and the next try uploads it', async ({ page }) => {
  const d = fakeDrive();
  await setup(page, d, ME);
  await page.goto('/art-slide/account');
  d.st.fail = 500;
  await page.getByTestId('sync-enable').click();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'error');
  expect((await readSave(page)).completed).toBe(7);
  d.st.fail = 0;
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');
  expect(JSON.parse(d.st.file!).counters).toBeTruthy();
});

test('records synced with another account are not uploaded to this one unless chosen', async ({ page }) => {
  const d = fakeDrive();
  await setup(page, d, ME);
  await page.addInitScript(() => localStorage.setItem('slides:sync', JSON.stringify({ enabled: true, owner: 'someone-else', lastSyncAt: 1 })));
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'other-account');
  await page.waitForTimeout(400);
  expect(d.st.writes).toBe(0);
  expect(d.st.file).toBeNull();
  await page.getByTestId('sync-use-device').click();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');
  expect(d.st.writes).toBe(1);
});

test('turning sync off withdraws Drive access and keeps the records; signing out stops syncing', async ({ page }) => {
  const d = fakeDrive();
  await setup(page, d, ME);
  await page.goto('/art-slide/account');
  await page.getByTestId('sync-enable').click();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');
  await page.getByTestId('sync-disable').click();
  await expect(page.getByTestId('sync-enable')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __revoked?: number }).__revoked)).toBe(1);
  expect((await readSave(page)).completed).toBe(7);
  expect(d.st.file).not.toBeNull(); // the file in the visitor's own Drive stays
});

test('without consent to Drive nothing is requested; sign-in alone never loads the Google script', async ({ page }) => {
  const d = fakeDrive();
  await setup(page, d, ME);
  const gis: string[] = [];
  page.on('request', (r) => r.url().includes('gsi/client') && gis.push(r.url()));
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('sync-enable')).toBeVisible();
  await page.waitForTimeout(500);
  expect(gis).toEqual([]);
  expect(d.st.tokens).toEqual([]);
});

test('a signed-out visitor sees no sync section and a build without the paid plan never calls Google', async ({ page, browser }) => {
  const d = fakeDrive();
  await setup(page, d, { signedIn: false, premium: false });
  await page.goto('/art-slide/account');
  await expect(page.getByTestId('signin')).toBeVisible();
  await expect(page.getByTestId('sync')).toHaveCount(0);
  const ctx2 = await browser.newContext(); // a fresh browser: no dev switches at all
  const p2 = await ctx2.newPage();
  const urls: string[] = [];
  p2.on('request', (r) => /accounts\.google|googleapis|\/api\//.test(r.url()) && urls.push(r.url()));
  await p2.goto('/art-slide/gallery');
  await p2.waitForTimeout(500);
  expect(urls).toEqual([]);
  await ctx2.close();
});

test('a star set on the play screen is uploaded to Drive (so the iOS app can get it), and a star from Drive shows up here', async ({ page }) => {
  const d = fakeDrive();
  await setup(page, d, ME);
  await page.goto('/art-slide/account');
  await page.getByTestId('sync-enable').click();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');
  // star a painting while playing
  await page.goto('/art-slide/play/monet-water-lilies');
  await page.getByTestId('favorite-toggle').click();
  await expect.poll(() => JSON.parse(d.st.file!).favorites?.['monet-water-lilies']?.on, { timeout: 15000 }).toBe(true); // synced a few seconds later
  expect(JSON.parse(d.st.file!).schema).toBe(2);
  // another device (the iOS app) stars a second painting in Drive: it appears here after the next sync
  const doc = JSON.parse(d.st.file!);
  doc.favorites['hokusai-great-wave'] = { on: true, at: Date.now() + 1000 };
  d.st.file = JSON.stringify(doc);
  await page.goto('/art-slide/account');
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'ok');
  await page.goto('/art-slide/play/hokusai-great-wave');
  await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'true');
});
