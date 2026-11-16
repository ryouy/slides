import { expect, test, type Page } from '@playwright/test';

/** "My Photos" (Premium): everything stays on the device. The tests act as Premium through the dev switch. */
const premium = (page: Page) => page.addInitScript(() => { localStorage.setItem('slides:dev-gating', '1'); localStorage.setItem('slides:dev-premium', '1'); });
const free = (page: Page) => page.addInitScript(() => localStorage.setItem('slides:dev-gating', '1'));

/** A real picture made in the page (a gradient with a mark, so tiles differ), as a file buffer. */
async function makePicture(page: Page, w: number, h: number, type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png') {
  const b64 = await page.evaluate(async ([w, h, type]) => {
    const c = document.createElement('canvas');
    c.width = w as number; c.height = h as number;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#d33'); grad.addColorStop(1, '#36c');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.font = 'bold 60px sans-serif'; g.fillText('ART', 20, 80);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type as string, 0.9));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; buf.forEach((x) => (s += String.fromCharCode(x)));
    return btoa(s);
  }, [w, h, type] as const);
  return Buffer.from(b64, 'base64');
}
const addFile = (page: Page, name: string, mimeType: string, buffer: Buffer) => page.getByTestId('photo-input').setInputFiles({ name, mimeType, buffer });

test('a Premium visitor adds a photo, sees it, plays it as a puzzle, and it stays after a reload', async ({ page }) => {
  await premium(page);
  await page.goto('/art-slide/photos');
  await expect(page.getByTestId('photos-empty')).toBeVisible();
  await addFile(page, 'holiday.png', 'image/png', await makePicture(page, 2400, 1600));
  const card = page.locator('[data-testid^="photo-"][href]').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.g-title')).toHaveText('holiday');
  await expect(page.getByTestId('photos-usage')).toContainText('1 of 20');
  await page.reload();
  await expect(page.locator('[data-testid^="photo-"][href]')).toHaveCount(1); // kept on this device
  await page.locator('[data-testid^="photo-"][href]').first().click();
  await expect(page).toHaveURL(/\/art-slide\/play\/custom:/);
  await expect(page.locator('.aboard')).toBeVisible();
  await expect(page.getByTestId('art-title')).toHaveText('holiday');
  const tiles = await page.locator('.atile').count();
  expect(tiles).toBeGreaterThan(5);
  await expect(page.getByTestId('art-desc')).toHaveCount(0); // no painting details for a photo
  await page.getByTestId('preview').click();
  await expect(page.getByTestId('preview-card')).toBeVisible();
  await expect(page.getByTestId('preview-description')).toHaveCount(0);
});

test('the picture is shrunk and stored only on the device: no network request carries it', async ({ page }) => {
  await premium(page);
  const sent: string[] = [];
  page.on('request', (r) => { if (r.method() !== 'GET' && r.method() !== 'HEAD') sent.push(`${r.method()} ${r.url()}`); if (r.postData()) sent.push(`body ${r.url()}`); });
  await page.goto('/art-slide/photos');
  await addFile(page, 'big.png', 'image/png', await makePicture(page, 3200, 2400));
  await expect(page.locator('[data-testid^="photo-"][href]')).toHaveCount(1);
  const dims = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const q = indexedDB.open('slides-photos', 1); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const rec: { width: number; height: number; blob: Blob; bytes: number } = await new Promise((res) => { const g = db.transaction('photos').objectStore('photos').getAll(); g.onsuccess = () => res(g.result[0]); });
    return { w: rec.width, h: rec.height, bytes: rec.bytes, type: rec.blob.type };
  });
  expect(Math.max(dims.w, dims.h)).toBeLessThanOrEqual(1600); // shrunk
  expect(dims.w / dims.h).toBeCloseTo(3200 / 2400, 1); // same proportions
  expect(dims.type).toBe('image/webp');
  expect(sent).toEqual([]); // never uploaded
  const stored = await page.evaluate(() => JSON.stringify(Object.keys(localStorage)) + JSON.stringify(localStorage.getItem('artslide:save')));
  expect(stored).not.toContain('data:image'); // the picture is not in localStorage / Drive-synced records either
});

test('only JPEG, PNG and WebP are accepted, judged by the file itself; bad files give a clear message', async ({ page }) => {
  await premium(page);
  await page.goto('/art-slide/photos');
  await addFile(page, 'a.jpg', 'image/jpeg', await makePicture(page, 600, 400, 'image/jpeg'));
  await addFile(page, 'b.webp', 'image/webp', await makePicture(page, 600, 400, 'image/webp'));
  await expect(page.locator('[data-testid^="photo-"][href]')).toHaveCount(2);
  await addFile(page, 'fake.png', 'image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')); // an SVG in disguise
  await expect(page.getByTestId('photos-errors')).toContainText('fake.png');
  await expect(page.getByTestId('photos-errors')).toContainText('JPEG, PNG and WebP');
  await addFile(page, 'broken.png', 'image/png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('not really a png')]));
  await expect(page.getByTestId('photos-errors')).toContainText('could not be read');
  await expect(page.locator('[data-testid^="photo-"][href]')).toHaveCount(2); // nothing bad was stored
  await addFile(page, 'huge.png', 'image/png', Buffer.alloc(21 * 1024 * 1024, 1));
  await expect(page.getByTestId('photos-errors')).toContainText('too large');
});

test('there is a limit of 20 photos, and a photo can be deleted', async ({ page }) => {
  await premium(page);
  await page.goto('/art-slide/photos');
  const tiny = await makePicture(page, 64, 48);
  for (let i = 0; i < 20; i++) await addFile(page, `p${i}.png`, 'image/png', tiny);
  await expect(page.locator('[data-testid^="photo-"][href]')).toHaveCount(20);
  await expect(page.getByTestId('photo-add')).toBeDisabled();
  await expect(page.getByTestId('photos-usage')).toContainText('20 of 20');
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-testid^="photo-del-"]').first().click();
  await expect(page.locator('[data-testid^="photo-"][href]')).toHaveCount(19);
  await expect(page.getByTestId('photo-add')).toBeEnabled();
});

test('a clear of a photo is recorded apart from the paintings', async ({ page }) => {
  await premium(page);
  await page.goto('/art-slide/photos');
  await addFile(page, 'mine.png', 'image/png', await makePicture(page, 640, 480));
  await page.locator('[data-testid^="photo-"][href]').first().click();
  await expect(page.locator('.aboard')).toBeVisible();
  const sol = await page.evaluate(async () => {
    for (let i = 0; i < 50 && !localStorage.getItem('artslide:save'); i++) await new Promise((r) => setTimeout(r, 50));
    return JSON.parse(localStorage.getItem('artslide:save')!).inProgress.free.puzzle.solution as number[];
  });
  for (const cell of sol) await page.locator(`.atile[data-cell="${cell}"]`).click({ timeout: 20000 });
  await expect(page.getByRole('dialog', { name: /COMPLETE!|CLEARED!/ })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('share-toggle')).toHaveCount(0); // a photo has no public page
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('artslide:save')!));
  expect(Object.keys(save.customRecords)).toHaveLength(1);
  expect(save.history).toEqual([]); // not in the painting history
  expect(save.completed).toBe(0);
  expect(save.records).toEqual({});
  expect(save.counters).toEqual({});
});

test('a Free visitor sees the offer (not the photos tools) and cannot open a photo by its address', async ({ page, context }) => {
  // first as Premium: store a photo
  const p1 = await context.newPage();
  await premium(p1);
  await p1.goto('/art-slide/photos');
  await addFile(p1, 'kept.png', 'image/png', await makePicture(p1, 320, 240));
  await expect(p1.locator('[data-testid^="photo-"][href]')).toHaveCount(1);
  const href = await p1.locator('[data-testid^="photo-"][href]').first().getAttribute('href');
  await p1.close();
  // then the same browser as Free (the contract ended)
  await page.addInitScript(() => localStorage.removeItem('slides:dev-premium')); // (the browser is shared: drop the Premium switch)
  await free(page);
  await page.goto('/art-slide/photos');
  await expect(page.getByTestId('premium-reason')).toContainText('own photos');
  await expect(page.getByTestId('photo-add')).toHaveCount(0);
  await expect(page.locator('[data-testid^="photo-"][href]')).toHaveCount(1); // the photo is still there (never deleted)
  await page.goto(href!);
  await expect(page.getByTestId('premium-reason')).toBeVisible();
  await expect(page.locator('.aboard')).toHaveCount(0);
  await page.goto('/art-slide/play'); // resuming does not get around it either
  await expect(page.locator('.aboard')).toHaveCount(0);
});

test('a photo that is no longer on the device says so', async ({ page }) => {
  await premium(page);
  await page.goto('/art-slide/play/custom:does-not-exist');
  await expect(page.getByTestId('photo-missing')).toBeVisible();
});
