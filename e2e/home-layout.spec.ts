import { expect, test } from '@playwright/test';

// The top row of the ART SLIDE home (Sign in / Account + Settings) must never touch the title or leave the screen, at any size.
const SIZES = [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [600, 900], [768, 1024], [1024, 768], [1440, 900]] as const;
for (const signedIn of [false, true]) for (const [w, h] of SIZES) {
  test(`home top row, ${signedIn ? 'signed in' : 'signed out'}, ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript((si) => {
      localStorage.setItem('slides:dev-gating', '1');
      localStorage.setItem('slides:dev-account', JSON.stringify({ config: { auth: true, billing: true, purchases: false }, me: { signedIn: si, premium: false } }));
    }, signedIn);
    await page.goto('/art-slide');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('home-account')).toBeVisible();
    let last = -1; // wait for the page glide-in to finish
    await expect.poll(async () => { const y = (await page.getByTestId('art-settings').boundingBox())!.y; const same = Math.abs(y - last) < 0.5; last = y; return same; }, { timeout: 5000 }).toBe(true);
    const acct = (await page.getByTestId('home-account').boundingBox())!;
    const set = (await page.getByTestId('art-settings').boundingBox())!;
    const title = await page.evaluate(() => { const h = document.querySelector('.art-home-title')!; const r = document.createRange(); r.selectNodeContents(h); const t = r.getBoundingClientRect(); return { x: t.x, y: h.getBoundingClientRect().y, width: t.width }; }); // the letters, not the full-width box
    for (const b of [acct, set]) {
      // above the title, or (very wide screens) beside it without touching its letters
      const above = b.y + b.height <= title.y + 1;
      const beside = b.x >= title.x + title.width;
      expect(above || beside, 'clear of the title').toBe(true);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, 'inside the screen').toBeLessThanOrEqual(w);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    const overlap = acct.x < set.x + set.width && set.x < acct.x + acct.width && acct.y < set.y + set.height && set.y < acct.y + acct.height;
    expect(overlap, 'the two buttons do not overlap').toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}
