/**
 * Operator details for the 特定商取引法に基づく表記, the Terms of Use and the Privacy Policy.
 *
 * Nothing here may be invented or guessed: an item the operator has not decided stays empty / null, the pages then show a
 * visible "not set" mark and paid subscriptions stay switched off (see canSubscribe). docs/LEGAL-CHECKLIST.md explains each
 * item and what the law says about it.
 */

/**
 * How a detail is shown on the notice.
 *  - { mode: 'public', value }  : printed on the page
 *  - { mode: 'on-request' }     : the page says it is provided without delay when asked for (消費者庁「通信販売広告Q&A」Q15・Q17:
 *                                 allowed for an individual's name, address and telephone if the notice says so AND the operator
 *                                 really answers a request without delay)
 *  - null                       : not decided yet (counts as missing)
 */
export type Disclosure = { mode: 'public'; value: string } | { mode: 'on-request' } | null;

export type LegalForm = 'individual' | 'corporation';

export interface OperatorInfo {
  /** 個人（法人ではない）か法人か. An individual who runs the service alone, with or without a business-start notification. */
  legalForm: LegalForm | null;
  /**
   * 販売事業者の氏名・名称. An individual's real (family-register) name, or a corporation's registered name. A trade name or the
   * site name alone is not a valid seller name (Q16). May be "on request".
   */
  name: Disclosure;
  /** 屋号 (optional, shown in addition to the name, never instead of it). */
  tradeName: string;
  /**
   * 運営統括責任者. For a corporation: the representative / the person responsible for the sales operation. For an
   * individual business the seller is that person, so this stays empty (the notice then says it is the seller).
   */
  representative: string;
  /** 所在地 */
  address: Disclosure;
  /** 電話番号 */
  phone: Disclosure;
  /** お問い合わせフォームのURL (the official contact channel; also where a request for the details is made). https only. */
  contactFormUrl: string;
  /** メールアドレス (optional: leave empty to keep it private). */
  email: string;
  /** 対応時間・回答の目安 (optional), e.g. 「通常、3営業日以内に返信します」. */
  supportHours: string;
  /** 開示請求への対応期間の目安 (optional), e.g. 「請求から3営業日以内」. The law only says 「遅滞なく」. */
  disclosureTarget: string;
  /** 消費税の扱い: 'inclusive' = ¥200 includes consumption tax / 'exempt' = tax-exempt business, no tax added / null = not decided. */
  tax: 'inclusive' | 'exempt' | null;
  /** 適格請求書発行事業者の登録番号 (T + 13 digits), only if registered (optional). */
  invoiceNumber: string;
  /** 管轄裁判所 (optional), e.g. 東京地方裁判所. Empty = the court the law provides. */
  court: string;
  /** 制定日・最終改定日 of the Terms and the Privacy Policy, YYYY-MM-DD. */
  effectiveDate: string;
}

export const OPERATOR: OperatorInfo = {
  // Decided by the operator (policy updated 2026-11-17): the seller name and the person responsible are
  // published (Stripe's public requirements); address, telephone and the e-mail address stay private (updated 2026-11-19: the e-mail
  // address is no longer published); address and telephone are provided without delay on request; every enquiry goes through the contact form.
  legalForm: 'individual',
  name: { mode: 'public', value: 'Ryo Matsushita' },
  tradeName: '',
  representative: 'Ryo Matsushita',
  address: { mode: 'on-request' },
  phone: { mode: 'on-request' },
  contactFormUrl: 'https://forms.gle/vksFVB2QUzdzKeEu6',
  email: '', // not published: enquiries only through the contact form
  supportHours: '',
  disclosureTarget: '',
  // Tax treatment: tax-exempt business. Set on the operator's own statement (an individual, no business-start notification,
  // not registered as a qualified invoice issuer, no election to be taxable). Whether the exemption really applies depends on
  // their sales history and filings, which the developer cannot check: see docs/LEGAL-CHECKLIST.md for the criteria.
  tax: 'exempt',
  invoiceNumber: '',
  court: '',
  // The effective date is the day the texts are really published: set it on that day with `npm run legal:date`.
  effectiveDate: '2026-11-17',
};

export type OperatorField = 'legalForm' | 'name' | 'representative' | 'address' | 'phone' | 'contactFormUrl' | 'tax' | 'effectiveDate';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const INVOICE = /^T\d{13}$/;

export function disclosureOk(d: Disclosure): boolean {
  return d !== null && (d.mode === 'on-request' || (d.mode === 'public' && d.value.trim().length > 0));
}

export function validFormUrl(u: string): boolean {
  try {
    const url = new URL(u.trim());
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Which required items are still missing (or malformed). */
export function missingOperatorFields(o: OperatorInfo = OPERATOR): OperatorField[] {
  const missing: OperatorField[] = [];
  if (o.legalForm === null) missing.push('legalForm');
  if (!disclosureOk(o.name)) missing.push('name');
  if (o.legalForm === 'corporation' && !o.representative.trim()) missing.push('representative'); // an individual business is its own responsible person
  if (!disclosureOk(o.address)) missing.push('address');
  if (!disclosureOk(o.phone)) missing.push('phone');
  if (!validFormUrl(o.contactFormUrl)) missing.push('contactFormUrl');
  if (o.tax === null) missing.push('tax');
  if (!DATE.test(o.effectiveDate) || Number.isNaN(Date.parse(o.effectiveDate))) missing.push('effectiveDate');
  return missing;
}

/** Problems in the optional items that were filled in (a malformed registration number or e-mail must not be published). */
export function operatorWarnings(o: OperatorInfo = OPERATOR): string[] {
  const w: string[] = [];
  if (o.invoiceNumber.trim() && !INVOICE.test(o.invoiceNumber.trim())) w.push('invoiceNumber must be T followed by 13 digits');
  if (o.email.trim() && !EMAIL.test(o.email.trim())) w.push('email is not a valid address (leave it empty to keep it private)');
  return w;
}

export function operatorReady(o: OperatorInfo = OPERATOR): boolean {
  try {
    if (o === OPERATOR && import.meta.env?.DEV && localStorage.getItem('slides:dev-operator') === '1') return true; // dev-only switch for tests
  } catch {
    /* no storage */
  }
  return missingOperatorFields(o).length === 0 && operatorWarnings(o).length === 0;
}
