/**
 * Operator details for the 特定商取引法に基づく表記, the Terms of Use and the Privacy Policy.
 *
 * LEAVE EMPTY until the operator supplies the real information: nothing here may be invented or guessed. While a
 * required item is missing the pages show a visible "not set" mark and paid subscriptions stay switched off
 * (see canSubscribe). See docs/LEGAL-CHECKLIST.md for what each item is and what the law says about it.
 */

/**
 * How a contact detail is shown on the notice.
 *  - { mode: 'public', value }  : printed on the page
 *  - { mode: 'on-request' }     : the page says it is sent without delay when asked for (特商法11条ただし書; the operator must then
 *                                 really answer such a request by e-mail, with the address where they actually work / a number they can be reached on)
 *  - null                       : not decided yet (counts as missing)
 */
export type Disclosure = { mode: 'public'; value: string } | { mode: 'on-request' } | null;

export interface OperatorInfo {
  /** 販売事業者: the seller's name (for an individual: their own name). */
  name: string;
  /** 屋号・サービス名義 (optional). */
  tradeName: string;
  /** 運営統括責任者: the person responsible for the operation (for a sole proprietor: themselves). */
  representative: string;
  /** 所在地 */
  address: Disclosure;
  /** 電話番号 */
  phone: Disclosure;
  /** 問い合わせ先メールアドレス (always public: it is also where a request for address/phone is sent). */
  email: string;
  /** 対応時間・回答の目安 (optional), e.g. 「平日10〜18時、2営業日以内に返信」. */
  supportHours: string;
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
  name: '',
  tradeName: '',
  representative: '',
  address: null,
  phone: null,
  email: '',
  supportHours: '',
  tax: null,
  invoiceNumber: '',
  court: '',
  effectiveDate: '',
};

export type OperatorField = 'name' | 'representative' | 'address' | 'phone' | 'email' | 'tax' | 'effectiveDate';
export const REQUIRED_FIELDS: OperatorField[] = ['name', 'representative', 'address', 'phone', 'email', 'tax', 'effectiveDate'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const INVOICE = /^T\d{13}$/;

export function disclosureOk(d: Disclosure): boolean {
  return d !== null && (d.mode === 'on-request' || (d.mode === 'public' && d.value.trim().length > 0));
}

/** Which required items are still missing (or malformed). */
export function missingOperatorFields(o: OperatorInfo = OPERATOR): OperatorField[] {
  const missing: OperatorField[] = [];
  if (!o.name.trim()) missing.push('name');
  if (!o.representative.trim()) missing.push('representative');
  if (!disclosureOk(o.address)) missing.push('address');
  if (!disclosureOk(o.phone)) missing.push('phone');
  if (!EMAIL.test(o.email.trim())) missing.push('email');
  if (o.tax === null) missing.push('tax');
  if (!DATE.test(o.effectiveDate) || Number.isNaN(Date.parse(o.effectiveDate))) missing.push('effectiveDate');
  return missing;
}

/** Problems in the optional items that were filled in (a malformed registration number must not be published). */
export function operatorWarnings(o: OperatorInfo = OPERATOR): string[] {
  const w: string[] = [];
  if (o.invoiceNumber.trim() && !INVOICE.test(o.invoiceNumber.trim())) w.push('invoiceNumber must be T followed by 13 digits');
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
