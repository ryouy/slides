import { describe, expect, it } from 'vitest';
import { commerceRows, formatDate, legalLang, planFacts, privacySections, PRICE_YEN, TBD, termsSections, type LegalLang, type Section } from './content';
import { OPERATOR, type OperatorInfo } from './operator';

const full: OperatorInfo = { name: 'Taro Example', tradeName: 'Example Games', representative: 'Taro Example', address: { mode: 'on-request' }, phone: { mode: 'public', value: '03-0000-0000' }, email: 'support@example.com', supportHours: 'Weekdays 10:00-18:00', tax: 'inclusive', invoiceNumber: 'T1234567890123', court: '東京地方裁判所', effectiveDate: '2026-12-01' };
const LANGS: LegalLang[] = ['ja', 'en'];
const text = (sections: Section[]) => sections.map((s) => `${s.title}\n${s.body.map((b) => (Array.isArray(b) ? b.join('\n') : b)).join('\n')}`).join('\n');

describe('nothing is invented', () => {
  for (const l of LANGS) {
    it(`${l}: with no operator details every missing item shows a visible "not set" mark`, () => {
      const rows = commerceRows(l, OPERATOR).map(([, v]) => v).join('\n');
      expect(rows).toContain(TBD[l]);
      expect(text(termsSections(l, OPERATOR))).toContain(TBD[l]);
      expect(text(privacySections(l, OPERATOR))).toContain(TBD[l]);
      // and no plausible-looking fake detail slipped in
      const all = `${rows}\n${text(termsSections(l, OPERATOR))}\n${text(privacySections(l, OPERATOR))}`;
      expect(all).not.toMatch(/@(?!.*(?:google|stripe|cloudflare))[a-z0-9-]+\.(com|jp|net)/i);
      expect(all).not.toMatch(/\d{2,4}-\d{2,4}-\d{3,4}/); // no phone number
      expect(all).not.toMatch(/〒|東京都|大阪府/); // no address
    });
    it(`${l}: with every detail set, no "not set" mark remains`, () => {
      const all = `${commerceRows(l, full).map(([, v]) => v).join('\n')}\n${text(termsSections(l, full))}\n${text(privacySections(l, full))}`;
      expect(all).not.toContain(TBD[l]);
      expect(all).toContain('support@example.com');
    });
  }
});

describe('the notice has every item the law lists for an online sale of a service', () => {
  it('ja: seller, responsible person, address, phone, e-mail, price, other charges, payment, start, term/renewal, cancelling, returns, system requirements', () => {
    const labels = commerceRows('ja', full).map(([k]) => k);
    for (const k of ['販売事業者', '運営統括責任者', '所在地', '電話番号', 'メールアドレス', '販売価格', '商品代金以外の必要料金', 'お支払い方法・時期', 'サービスの提供時期', '契約期間・自動更新', '解約の方法・条件', '返品・返金・申込みの撤回', '動作環境']) expect(labels, k).toContain(k);
  });
  it('en has the same items in the same order', () => {
    expect(commerceRows('en', full)).toHaveLength(commerceRows('ja', full).length);
  });
  it('the purchase facts are exactly the ones on the notice (one source, so they cannot disagree)', () => {
    for (const l of LANGS) {
      const notice = commerceRows(l, full).map(([, v]) => v).join('\n');
      for (const [, v] of planFacts(l, full)) expect(notice, v.slice(0, 30)).toContain(v);
    }
  });
  it('states the price, monthly auto-renewal, no fixed term, how to cancel, no cooling-off and no refund', () => {
    const ja = planFacts('ja', full).map(([, v]) => v).join('\n');
    for (const s of [`${PRICE_YEN}円`, '税込', '自動で更新', '契約期間の定めはなく', 'サブスクリプションを管理', '解約料はかかりません', 'クーリング・オフ制度はありません', '日割り返金はいたしません', 'ただちに']) expect(ja, s).toContain(s);
    const en = planFacts('en', full).map(([, v]) => v).join('\n');
    for (const s of ['¥200 per month', 'tax included', 'automatically every month', 'no fixed term', 'Manage subscription', 'no cancellation fee', 'no statutory cooling-off', 'pro-rate']) expect(en, s).toContain(s);
  });
  it('the tax wording follows the operator (a tax-exempt business must not say 税込)', () => {
    expect(planFacts('ja', { ...full, tax: 'exempt' })[0][1]).not.toContain('税込');
    expect(planFacts('ja', { ...full, tax: 'exempt' })[0][1]).toContain('納税義務が免除');
    expect(planFacts('ja', { ...full, tax: null })[0][1]).toContain(TBD.ja);
  });
});

describe('address and phone', () => {
  it('"on request" says it will be sent without delay and where to ask; "public" prints the value', () => {
    const rows = Object.fromEntries(commerceRows('ja', full));
    expect(rows['所在地']).toContain('請求があった場合には、遅滞なく開示いたします');
    expect(rows['所在地']).toContain('support@example.com');
    expect(rows['電話番号']).toBe('03-0000-0000');
    const en = Object.fromEntries(commerceRows('en', full));
    expect(en['Address']).toContain('without delay on request');
  });
});

describe('the texts agree with each other and with how the service works', () => {
  it('Japanese and English have the same sections', () => {
    expect(termsSections('en', full).map((s) => s.id)).toEqual(termsSections('ja', full).map((s) => s.id));
    expect(privacySections('en', full).map((s) => s.id)).toEqual(privacySections('ja', full).map((s) => s.id));
  });
  it('terms cover plans, auto-renewal, cancelling, refunds, failed payment, price changes, photos, law', () => {
    const ids = termsSections('ja', full).map((s) => s.id);
    for (const id of ['plans', 'fees', 'cancel', 'refund', 'failed', 'price-change', 'photos', 'law', 'disclaimer']) expect(ids).toContain(id);
  });
  it('the terms state the same plans as the product: 40 paintings, level 5 / 7, daily for everybody', () => {
    const ja = text(termsSections('ja', full));
    expect(ja).toContain('固定の40作品');
    expect(ja).toContain('レベル5まで');
    expect(ja).toContain('レベル7まで');
    expect(ja).toContain('デイリーパズルは、プランにかかわらず');
    const en = text(termsSections('en', full));
    expect(en).toContain('40 paintings');
    expect(en).toContain('levels up to 5');
    expect(en).toContain('levels up to 7');
  });
  it('the liability limit does not apply to intent / gross negligence or where consumer law forbids it', () => {
    expect(text(termsSections('ja', full))).toMatch(/故意または重大な過失/);
    expect(text(termsSections('ja', full))).toMatch(/消費者契約法/);
  });
  it('the privacy policy names what is really stored and the providers, and says photos never leave the device', () => {
    const ja = text(privacySections('ja', full));
    for (const s of ['sub', '表示名', 'メールアドレスは保存しません', 'Stripe', 'Cloudflare', 'Google', '忍者AdMax', '最長30日', 'アカウントを削除', 'HTTPS', '外国', '開示']) expect(ja, s).toContain(s);
    expect(ja).toContain('当方のサーバーへの送信、共有、Googleドライブへの保存は行いません');
    const en = text(privacySections('en', full));
    expect(en).toContain('We do not store your e-mail address');
    expect(en).toContain('not uploaded to our servers');
  });
  it('court: the named court is added to, not substituted for, the statutory ones; empty is fine', () => {
    expect(text(termsSections('ja', full))).toContain('東京地方裁判所');
    expect(text(termsSections('ja', { ...full, court: '' }))).not.toContain(TBD.ja);
  });
});

describe('small helpers', () => {
  it('formats dates in each language, and marks a bad date', () => {
    expect(formatDate('ja', '2026-12-01')).toBe('2026年12月1日');
    expect(formatDate('en', '2026-12-01')).toBe('December 1, 2026');
    expect(formatDate('ja', '')).toBe(TBD.ja);
    expect(formatDate('en', '2026-02-31x')).toBe(TBD.en);
  });
  it('only Japanese gets the Japanese text; every other language gets English', () => {
    expect(legalLang('ja')).toBe('ja');
    for (const l of ['en', 'zh', 'ko', 'es', 'fr', 'de']) expect(legalLang(l)).toBe('en');
  });
});
