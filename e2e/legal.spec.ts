import { expect, test, type Page } from '@playwright/test';
import { OPERATOR } from '../src/legal/operator';

const DATE_OPEN = OPERATOR.effectiveDate === ''; // false once the publication date has been set

/** The legal pages and the facts shown before buying. Operator details are NOT filled in yet: every gap must show. */
const gating = (page: Page) => page.addInitScript(() => { localStorage.setItem('slides:dev-gating', '1'); localStorage.setItem('slides:dev-operator', '1'); });

async function mockApi(page: Page, me: object) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (b: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (path === '/api/config') return json({ auth: true, billing: true, purchases: true });
    if (path === '/api/me' || path === '/api/billing/status') return json(me);
    if (path === '/api/billing/checkout') return json({ url: '/art-slide/premium?checkout=mock' });
    return route.fulfill({ status: 404, body: '{}' });
  });
}

/** Opens the "before you subscribe" pull-down (harmless if it is already open). */
async function openSheet(page: import('@playwright/test').Page) {
  const d = page.getByTestId('purchase-details');
  await d.waitFor({ timeout: 8000 }).catch(() => {}); // not every visitor gets the purchase panel
  if (!(await d.count())) return;
  await page.waitForLoadState('networkidle'); // the account answer has arrived: the panel will not be rebuilt (and folded) any more
  // the panel can re-render while the account answer arrives (that closes the element again): retry until it stays open
  await expect(async () => {
    if (!(await d.evaluate((el) => (el as HTMLDetailsElement).open))) await d.locator('summary').click();
    await expect(d).toHaveJSProperty('open', true);
  }).toPass({ timeout: 20000 });
}

test('the notice lists every item, in Japanese and in English, and marks what the operator has not supplied', async ({ page }) => {
  await page.goto('/commerce');
  await page.getByTestId('legal-lang-ja').click();
  await expect(page.locator('.topbar h1')).toHaveText('特定商取引法に基づく表記');
  const ja = page.getByTestId('commerce');
  for (const k of ['販売事業者', '運営統括責任者', '所在地', '電話番号', 'お問い合わせ先', '販売価格', '商品代金以外の必要料金', 'お支払い方法・時期', 'サービスの提供時期', '契約期間・自動更新', '解約の方法・条件', '返品・返金・申込みの撤回', '動作環境']) await expect(ja).toContainText(k);
  await expect(ja).toContainText('クーリング・オフ制度はありません');
  // name, address and telephone: provided on request, with the form to ask in
  for (const k of ['所在地', '電話番号']) await expect(ja.locator('.commerce-row', { hasText: k }).first()).toContainText('請求があった場合には、遅滞なく開示いたします');
  await expect(ja).toContainText('事業者情報の開示請求');
  await expect(ja.getByTestId('legal-link').first()).toHaveAttribute('href', 'https://forms.gle/vksFVB2QUzdzKeEu6');
  // published: seller, person responsible, e-mail address
  await expect(ja.locator('.commerce-row', { hasText: '販売事業者' }).first()).toContainText('Ryo Matsushita');
  await expect(ja.locator('.commerce-row', { hasText: '運営統括責任者' }).first()).toContainText('Ryo Matsushita');
  await expect(ja.locator('.commerce-row', { hasText: 'お問い合わせ先' }).first()).not.toContainText('@');
  await expect(ja).not.toContainText('個人で運営しているため');
  // what is still undecided is marked, and listed above
  await expect(ja).toContainText('月額200円（税込・追加の消費税請求なし）');
  await expect(ja).toContainText('適格請求書発行事業者ではありません');
  expect(await ja.getByTestId('legal-tbd').count()).toBe(0); // the notice itself is complete
  if (DATE_OPEN) {
    await expect(page.getByTestId('commerce-incomplete')).toContainText('運営者情報が未設定'); // only the effective date is still open
    await expect(page.getByTestId('commerce-incomplete')).toContainText('制定日');
    await expect(page.getByTestId('commerce-incomplete')).not.toContainText('消費税の扱い');
  } else await expect(page.getByTestId('commerce-incomplete')).toHaveCount(0); // everything is set: no warning
  if (DATE_OPEN) await expect(page.getByTestId('commerce-incomplete')).not.toContainText('所在地'); // decided: on request
  await page.getByTestId('legal-lang-en').click();
  await expect(page.locator('.topbar h1')).toHaveText('Notice under the Act on Specified Commercial Transactions');
  await expect(page.getByTestId('commerce')).toContainText('refunds');
  if (DATE_OPEN) await expect(page.getByTestId('commerce-incomplete')).toContainText('not set yet');
  expect(await page.locator('.commerce-row').count()).toBe(15);
});

test('terms and privacy: complete texts in Japanese and English, with unset items marked, and no made-up details', async ({ page }) => {
  for (const [path, ja, en] of [['/terms', '利用規約', 'Terms of Use'], ['/privacy', 'プライバシーポリシー', 'Privacy Policy']] as const) {
    await page.goto(path);
    await page.getByTestId('legal-lang-ja').click();
    await expect(page.locator('.topbar h1')).toHaveText(ja);
    expect(await page.locator('.legal-sections section').count()).toBeGreaterThanOrEqual(12);
    if (DATE_OPEN) expect(await page.getByTestId('legal-tbd').count()).toBeGreaterThan(0);
    else expect(await page.getByTestId('legal-tbd').count()).toBe(0); // the date is set: no gaps anywhere
    await page.getByTestId('legal-lang-en').click();
    await expect(page.locator('.topbar h1')).toHaveText(en);
    expect(await page.locator('.legal-sections section').count()).toBeGreaterThanOrEqual(12);
  }
  await page.goto('/terms');
  await page.getByTestId('legal-lang-ja').click();
  const text = await page.getByTestId('legal-sections').innerText();
  expect(text).toContain('月額200円');
  expect(text).toContain('自動で請求');
  expect(text).toContain('サブスクリプションを管理');
  expect([...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g)].map((m) => m[0])).toEqual([]); // no other e-mail address
});

test('the interface language picks the legal language: Japanese gets Japanese, everything else English', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('lang-select').selectOption('ja');
  await page.goto('/terms');
  await expect(page.locator('.topbar h1')).toHaveText('利用規約');
  await page.goto('/settings');
  await page.getByTestId('lang-select').selectOption('de');
  await page.goto('/terms');
  await expect(page.locator('.topbar h1')).toHaveText('Terms of Use');
  await expect(page.locator('.legal-note')).toContainText('Japanese and English');
});

test('the notice, terms, privacy and contact are one click away from every page footer', async ({ page }) => {
  await page.goto('/about');
  for (const [id, path] of [['footer-commerce', '/commerce']] as const) {
    await page.getByTestId(id).click();
    await expect(page).toHaveURL(new RegExp(path + '$'));
  }
  await page.goto('/about');
  for (const name of ['Privacy', 'Terms', 'Contact']) await expect(page.locator('footer.footer').getByRole('link', { name })).toBeVisible();
});

test('contact page: the form and the published e-mail address are the channels', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByTestId('contact')).toBeVisible();
  await expect(page.getByTestId('contact-form').getByTestId('legal-link')).toHaveAttribute('href', 'https://forms.gle/vksFVB2QUzdzKeEu6');
  await expect(page.getByTestId('contact-mail')).toHaveCount(0); // no e-mail address is published
  await page.getByTestId('legal-lang-ja').click();
  await expect(page.getByTestId('contact')).toContainText('事業者情報の開示請求');
});

test('the contact form is linked from the footer, the notice, the terms and the privacy policy (opens in a new tab, safely)', async ({ page }) => {
  const FORM = 'https://forms.gle/vksFVB2QUzdzKeEu6';
  await page.goto('/about');
  const footer = page.getByTestId('footer-contact');
  await expect(footer).toHaveAttribute('href', FORM);
  await expect(footer).toHaveAttribute('target', '_blank');
  expect(await footer.getAttribute('rel')).toContain('noopener');
  for (const path of ['/commerce', '/terms', '/privacy']) {
    await page.goto(path);
    await page.getByTestId('legal-lang-ja').click();
    const links = page.getByTestId('legal-link').filter({ hasText: 'forms.gle' });
    expect(await links.count(), path).toBeGreaterThan(0);
    await expect(links.first(), path).toHaveAttribute('href', FORM);
    await expect(links.first()).toHaveAttribute('target', '_blank');
    expect(await links.first().getAttribute('rel')).toContain('noopener');
    await page.getByTestId('legal-lang-en').click();
    expect(await page.getByTestId('legal-link').filter({ hasText: 'forms.gle' }).count(), `${path} (en)`).toBeGreaterThan(0);
  }
});

test('terms and privacy: the only e-mail address published is the operator\u2019s', async ({ page }) => {
  for (const path of ['/terms', '/privacy', '/commerce', '/contact']) {
    await page.goto(path);
    for (const l of ['ja', 'en']) {
      await page.getByTestId(`legal-lang-${l}`).click();
      const found = [...(await page.locator('.prose').innerText()).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g)].map((m) => m[0]);
      expect(found, `${path} ${l}`).toEqual([]);
    }
  }
});

for (const lang of ['en', 'ja'] as const) {
  test(`before buying (${lang}): price, renewal, payment, total, cancelling and refunds are shown, and the button needs consent`, async ({ page }) => {
    await gating(page);
    await page.addInitScript((l) => localStorage.setItem('wordslide:save', JSON.stringify({ version: 1, settings: { lang: l, theme: 'system', colorblind: false, adConsent: null }, completed: 0, noHintClears: 0, dailyHistory: {}, endlessStreak: 0, maxEndlessStreak: 0, bests: { easy: {}, normal: {}, hard: {} }, history: [], inProgress: {}, lastDifficulty: 'normal' })), lang);
    await mockApi(page, { signedIn: true, canPurchase: true, id: 'u', name: 'Ann', premium: false, status: null });
    await page.goto('/art-slide/premium');
    await openSheet(page);
    const facts = page.getByTestId('purchase-facts');
    await expect(facts).toBeVisible();
    const t = await facts.innerText();
    if (lang === 'ja') for (const s of ['月額200円', '自動で更新', '契約期間の定めはなく', 'サブスクリプションを管理', '解約料はかかりません', 'クーリング・オフ制度はありません', '日割り返金はいたしません', '支払総額の目安', '追加の消費税請求なし']) expect(t).toContain(s);
    else for (const s of ['¥200 per month', 'automatically every month', 'no fixed term', 'Manage subscription', 'no cancellation fee', 'no statutory cooling-off', 'pro-rate', 'Total (guide)', 'no additional consumption tax']) expect(t).toContain(s);
    // the button states the obligation and stays off until the box is ticked
    const button = page.getByTestId('premium-subscribe');
    await expect(button).toContainText(lang === 'ja' ? '月額200円・自動更新' : '¥200 / month, auto-renewing');
    await expect(button).toBeDisabled();
    await page.getByTestId('premium-agree').check();
    await expect(button).toBeEnabled();
    await page.getByTestId('premium-agree').uncheck();
    await expect(button).toBeDisabled();
    await expect(page.getByTestId('footer-commerce')).toBeVisible(); // the notice is linked in the page footer (not repeated inside the offer)
    await expect(page.getByTestId('premium').locator('a')).toHaveCount(await page.getByTestId('premium').locator('a[href^="https://"]').count()); // no second row of Terms / Privacy / Notice links in the offer
    await expect(page.getByTestId('purchase-seller')).toContainText(lang === 'ja' ? '請求があった場合に遅滞なく開示します' : 'without delay on request');
    await expect(page.getByTestId('purchase-seller').getByTestId('legal-link')).toHaveAttribute('href', 'https://forms.gle/vksFVB2QUzdzKeEu6');
  });
}

test('the account screen sends a visitor to the purchase screen (with all the facts), not straight to payment', async ({ page }) => {
  await gating(page);
  await mockApi(page, { signedIn: true, canPurchase: true, id: 'u', name: 'Ann', premium: false, status: null });
  await page.goto('/art-slide/account');
  await page.getByTestId('account-subscribe').click();
  await expect(page).toHaveURL(/\/art-slide\/premium$/);
  await openSheet(page);
  await expect(page.getByTestId('purchase-facts')).toBeVisible();
});

test('a Premium visitor is not shown the purchase facts again', async ({ page }) => {
  await gating(page);
  await mockApi(page, { signedIn: true, id: 'u', name: 'Ann', premium: true, status: 'active', currentPeriodEnd: Math.floor(Date.now() / 1000) + 86400 * 20, cancelAtPeriodEnd: false });
  await page.goto('/art-slide/premium');
  await expect(page.getByTestId('premium-active')).toBeVisible();
  await expect(page.getByTestId('purchase-facts')).toHaveCount(0);
});
