import { describe, expect, it } from 'vitest';
import { commerceRows, disclosureNote, formatDate, legalLang, planFacts, privacySections, requestHow, PRICE_YEN, TBD, termsSections, type LegalLang, type Section } from './content';
import { OPERATOR, type OperatorInfo } from './operator';

const full: OperatorInfo = { legalForm: 'individual', name: { mode: 'on-request' }, tradeName: 'Example Games', representative: '', address: { mode: 'on-request' }, phone: { mode: 'on-request' }, contactFormUrl: 'https://forms.gle/example', email: '', supportHours: 'Replies within 3 business days', disclosureTarget: '3営業日以内', tax: 'inclusive', invoiceNumber: 'T1234567890123', court: '東京地方裁判所', effectiveDate: '2026-12-01' };
const LANGS: LegalLang[] = ['ja', 'en'];
const text = (sections: Section[]) => sections.map((s) => `${s.title}\n${s.body.map((b) => (Array.isArray(b) ? b.join('\n') : b)).join('\n')}`).join('\n');

describe('nothing is invented', () => {
  for (const l of LANGS) {
    it(`${l}: the notice itself is complete; only an unset effective date shows a visible "not set" mark (none once it is set)`, () => {
      const open = OPERATOR.effectiveDate === '';
      expect(commerceRows(l, OPERATOR).map(([, v]) => v).join('\n')).not.toContain(TBD[l]);
      expect(text(termsSections(l, OPERATOR)).includes(TBD[l])).toBe(open);
      expect(text(privacySections(l, OPERATOR)).includes(TBD[l])).toBe(open);
      expect(text(termsSections(l, { ...OPERATOR, effectiveDate: '' }))).toContain(TBD[l]);
    });
    it(`${l}: the published details are the decided ones; the private ones (address, telephone) never appear`, () => {
      const all = `${commerceRows(l, OPERATOR).map(([, v]) => v).join('\n')}\n${text(termsSections(l, OPERATOR))}\n${text(privacySections(l, OPERATOR))}`;
      const rows = Object.fromEntries(commerceRows(l, OPERATOR));
      expect(rows[l === 'ja' ? '販売事業者' : 'Seller']).toBe('Ryo Matsushita');
      expect(rows[l === 'ja' ? '運営統括責任者' : 'Person responsible for operations']).toBe('Ryo Matsushita');
      expect(rows[l === 'ja' ? 'お問い合わせ先' : 'Contact']).toContain('[removed]');
      expect([...all.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g)].map((m) => m[0]).filter((a) => a !== '[removed]')).toEqual([]); // no other e-mail address
      expect(all).not.toMatch(/\d{2,4}-\d{2,4}-\d{3,4}/); // no phone number
      expect(all).not.toMatch(/〒|東京都|大阪府/); // no address
      for (const k of l === 'ja' ? ['所在地', '電話番号'] : ['Address', 'Telephone']) expect(rows[k], k).toMatch(/請求があった場合には、遅滞なく開示いたします|without delay on request/);
    });
    it(`${l}: with every detail set, no "not set" mark remains and the form is named`, () => {
      const all = `${commerceRows(l, full).map(([, v]) => v).join('\n')}\n${text(termsSections(l, full))}\n${text(privacySections(l, full))}`;
      expect(all).not.toContain(TBD[l]);
      expect(all).toContain('https://forms.gle/example');
      expect(all).not.toContain('@'); // this fixture publishes no e-mail address
    });
  }
});

describe('the notice has every item the law lists for an online sale of a service', () => {
  it('ja: seller, responsible person, address, phone, e-mail, price, other charges, payment, start, term/renewal, cancelling, returns, system requirements', () => {
    const labels = commerceRows('ja', full).map(([k]) => k);
    for (const k of ['販売事業者', '運営統括責任者', '所在地', '電話番号', 'お問い合わせ先', '販売価格', '商品代金以外の必要料金', 'お支払い方法・時期', 'サービスの提供時期', '契約期間・自動更新', '解約の方法・条件', '返品・返金・申込みの撤回', '動作環境']) expect(labels, k).toContain(k);
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
  it('one price wording for everybody, whichever tax treatment: the amount is the total, nothing is added', () => {
    for (const tax of ['exempt', 'inclusive'] as const) {
      expect(planFacts('ja', { ...full, tax })[0][1]).toBe('月額200円（税込・追加の消費税請求なし）');
      expect(planFacts('en', { ...full, tax })[0][1]).toBe('¥200 per month (tax included; no additional consumption tax is charged)');
    }
    expect(planFacts('ja', { ...full, tax: null })[0][1]).toContain(TBD.ja); // not decided yet: marked
    expect(planFacts('ja', OPERATOR)[0][1]).toBe('月額200円（税込・追加の消費税請求なし）'); // what the site really shows
  });
  it('says plainly that the operator is not an invoice issuer, unless a registration number is given', () => {
    expect(Object.fromEntries(commerceRows('ja', { ...full, invoiceNumber: '' }))['適格請求書（インボイス）']).toContain('登録していません');
    expect(Object.fromEntries(commerceRows('en', { ...full, invoiceNumber: '' }))['Qualified invoices']).toContain('not registered');
    expect(Object.fromEntries(commerceRows('ja', full))['適格請求書発行事業者の登録番号']).toBe('T1234567890123');
  });
});

describe('name, address and telephone are provided on request', () => {
  it('ja: each says it is provided without delay on request, and where and how to ask', () => {
    const rows = Object.fromEntries(commerceRows('ja', full));
    for (const k of ['販売事業者', '所在地', '電話番号']) {
      expect(rows[k], k).toContain('請求があった場合には、遅滞なく開示いたします');
      expect(rows[k], k).toContain('https://forms.gle/example');
      expect(rows[k], k).toContain('事業者情報の開示請求');
      expect(rows[k], k).toContain('3営業日以内');
    }
  });
  it('en: the same', () => {
    const rows = Object.fromEntries(commerceRows('en', full));
    for (const k of ['Seller', 'Address', 'Telephone']) {
      expect(rows[k], k).toContain('without delay on request');
      expect(rows[k], k).toContain('https://forms.gle/example');
      expect(rows[k], k).toContain('Request for the operator’s details');
    }
  });
  it('a public value is printed instead', () => {
    expect(Object.fromEntries(commerceRows('ja', { ...full, name: { mode: 'public', value: '山田 太郎' }, phone: { mode: 'public', value: '03-0000-0000' } }))['電話番号']).toBe('03-0000-0000');
    expect(Object.fromEntries(commerceRows('ja', { ...full, name: { mode: 'public', value: '山田 太郎' } }))['販売事業者']).toContain('山田 太郎');
  });
  it('the contact row names the form (and the e-mail only if the operator chose to publish one)', () => {
    expect(Object.fromEntries(commerceRows('ja', full))['お問い合わせ先']).toContain('https://forms.gle/example');
    expect(Object.fromEntries(commerceRows('ja', full))['お問い合わせ先']).not.toContain('メール');
    expect(Object.fromEntries(commerceRows('ja', { ...full, email: 'help@example.com' }))['お問い合わせ先']).toContain('help@example.com');
  });
  it('the responsible person: the seller itself for a sole proprietor, a named person for a company', () => {
    expect(Object.fromEntries(commerceRows('ja', full))['運営統括責任者']).toContain('個人で運営しているため');
    expect(Object.fromEntries(commerceRows('ja', { ...full, legalForm: 'corporation', representative: '佐藤 花子' }))['運営統括責任者']).toBe('佐藤 花子');
    expect(Object.fromEntries(commerceRows('ja', { ...full, legalForm: 'corporation', representative: '' }))['運営統括責任者']).toContain(TBD.ja);
  });
  it('the terms and the privacy policy repeat it and use the form as the contact; the privacy policy names the form as a data source', () => {
    for (const l of LANGS) {
      expect(text(termsSections(l, full))).toContain('https://forms.gle/example');
      expect(text(privacySections(l, full))).toContain('https://forms.gle/example');
    }
    expect(text(termsSections('ja', full))).toContain('住所・電話番号は、請求があった場合に遅滞なく開示します');
    expect(requestHow('ja', full)).toContain('事業者情報の開示請求');
    expect(requestHow('ja', { ...full, email: 'help@example.com' })).toContain('help@example.com');
    expect(text(privacySections('ja', full))).toContain('Googleフォーム');
    expect(text(privacySections('en', full))).toContain('Google Forms');
    expect(text(termsSections('ja', full))).toContain('の運営者（個人、屋号：Example Games。氏名・住所・電話番号は');
    expect(text(termsSections('ja', { ...full, tradeName: '' }))).toContain('の運営者（個人。氏名・住所・電話番号は');
  });
  it('the purchase screen says it too', () => {
    expect(disclosureNote('ja', full)).toContain('遅滞なく開示します');
    expect(disclosureNote('ja', full)).toContain('https://forms.gle/example');
    expect(disclosureNote('en', full)).toContain('without delay on request');
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
