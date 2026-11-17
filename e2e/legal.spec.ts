import { expect, test, type Page } from '@playwright/test';

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

test('the notice lists every item, in Japanese and in English, and marks what the operator has not supplied', async ({ page }) => {
  await page.goto('/commerce');
  await page.getByTestId('legal-lang-ja').click();
  await expect(page.locator('.topbar h1')).toHaveText('特定商取引法に基づく表記');
  const ja = page.getByTestId('commerce');
  for (const k of ['販売事業者', '運営統括責任者', '所在地', '電話番号', 'メールアドレス', '販売価格', '商品代金以外の必要料金', 'お支払い方法・時期', 'サービスの提供時期', '契約期間・自動更新', '解約の方法・条件', '返品・返金・申込みの撤回', '動作環境']) await expect(ja).toContainText(k);
  await expect(ja).toContainText('クーリング・オフ制度はありません');
  expect(await page.getByTestId('legal-tbd').count()).toBeGreaterThanOrEqual(4); // name, responsible person, address, phone, e-mail... all visibly unset
  await expect(page.getByTestId('commerce-incomplete')).toContainText('運営者情報が未設定');
  await page.getByTestId('legal-lang-en').click();
  await expect(page.locator('.topbar h1')).toHaveText('Notice under the Act on Specified Commercial Transactions');
  await expect(page.getByTestId('commerce')).toContainText('refunds');
  await expect(page.getByTestId('commerce-incomplete')).toContainText('not set yet');
  expect(await page.locator('.commerce-row').count()).toBe(14);
});

test('terms and privacy: complete texts in Japanese and English, with unset items marked, and no made-up details', async ({ page }) => {
  for (const [path, ja, en] of [['/terms', '利用規約', 'Terms of Use'], ['/privacy', 'プライバシーポリシー', 'Privacy Policy']] as const) {
    await page.goto(path);
    await page.getByTestId('legal-lang-ja').click();
    await expect(page.locator('.topbar h1')).toHaveText(ja);
    expect(await page.locator('.legal-sections section').count()).toBeGreaterThanOrEqual(12);
    expect(await page.getByTestId('legal-tbd').count()).toBeGreaterThan(0);
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
  expect(text).not.toMatch(/@[a-z0-9-]+\.(com|jp)/i); // no invented e-mail address
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

test('contact page: no address is made up; the e-mail is marked as not set', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByTestId('contact')).toBeVisible();
  await expect(page.getByTestId('legal-tbd')).toBeVisible();
  await expect(page.getByTestId('contact-mail')).toHaveCount(0);
});

for (const lang of ['en', 'ja'] as const) {
  test(`before buying (${lang}): price, renewal, payment, total, cancelling and refunds are shown, and the button needs consent`, async ({ page }) => {
    await gating(page);
    await page.addInitScript((l) => localStorage.setItem('wordslide:save', JSON.stringify({ version: 1, settings: { lang: l, theme: 'system', colorblind: false, adConsent: null }, completed: 0, noHintClears: 0, dailyHistory: {}, endlessStreak: 0, maxEndlessStreak: 0, bests: { easy: {}, normal: {}, hard: {} }, history: [], inProgress: {}, lastDifficulty: 'normal' })), lang);
    await mockApi(page, { signedIn: true, id: 'u', name: 'Ann', premium: false, status: null });
    await page.goto('/art-slide/premium');
    const facts = page.getByTestId('purchase-facts');
    await expect(facts).toBeVisible();
    const t = await facts.innerText();
    if (lang === 'ja') for (const s of ['月額200円', '自動で更新', '契約期間の定めはなく', 'サブスクリプションを管理', '解約料はかかりません', 'クーリング・オフ制度はありません', '日割り返金はいたしません', '支払総額の目安']) expect(t).toContain(s);
    else for (const s of ['¥200 per month', 'automatically every month', 'no fixed term', 'Manage subscription', 'no cancellation fee', 'no statutory cooling-off', 'pro-rate', 'Total (guide)']) expect(t).toContain(s);
    // the button states the obligation and stays off until the box is ticked
    const button = page.getByTestId('premium-subscribe');
    await expect(button).toContainText(lang === 'ja' ? '月額200円・自動更新' : '¥200 / month, auto-renewing');
    await expect(button).toBeDisabled();
    await page.getByTestId('premium-agree').check();
    await expect(button).toBeEnabled();
    await page.getByTestId('premium-agree').uncheck();
    await expect(button).toBeDisabled();
    await expect(page.getByTestId('premium-commerce-link')).toBeVisible();
  });
}

test('the account screen sends a visitor to the purchase screen (with all the facts), not straight to payment', async ({ page }) => {
  await gating(page);
  await mockApi(page, { signedIn: true, id: 'u', name: 'Ann', premium: false, status: null });
  await page.goto('/art-slide/account');
  await page.getByTestId('account-subscribe').click();
  await expect(page).toHaveURL(/\/art-slide\/premium$/);
  await expect(page.getByTestId('purchase-facts')).toBeVisible();
});

test('a Premium visitor is not shown the purchase facts again', async ({ page }) => {
  await gating(page);
  await mockApi(page, { signedIn: true, id: 'u', name: 'Ann', premium: true, status: 'active', currentPeriodEnd: Math.floor(Date.now() / 1000) + 86400 * 20, cancelAtPeriodEnd: false });
  await page.goto('/art-slide/premium');
  await expect(page.getByTestId('premium-active')).toBeVisible();
  await expect(page.getByTestId('purchase-facts')).toHaveCount(0);
});
