/**
 * Operator details for the 特定商取引法に基づく表記 (Act on Specified Commercial Transactions notice).
 *
 * LEAVE EMPTY until the operator supplies the real information: never put invented details here. Paid
 * subscriptions stay switched off while any required field is empty (see canSubscribe).
 *
 * A field may also hold the statement「請求があった場合、遅滞なく開示します」 if the operator chooses to disclose
 * address / phone only on request (the operator decides this, with their own legal advice).
 */
export interface OperatorInfo {
  /** 販売事業者（個人の場合は氏名） */
  businessName: string;
  /** 運営統括責任者 */
  representative: string;
  /** 所在地 */
  address: string;
  /** 電話番号 */
  phone: string;
  /** メールアドレス（問い合わせ先） */
  email: string;
}

export const OPERATOR: OperatorInfo = {
  businessName: '',
  representative: '',
  address: '',
  phone: '',
  email: '',
};

export const REQUIRED_FIELDS: (keyof OperatorInfo)[] = ['businessName', 'representative', 'address', 'phone', 'email'];
export const missingOperatorFields = (o: OperatorInfo = OPERATOR): (keyof OperatorInfo)[] => REQUIRED_FIELDS.filter((k) => !o[k].trim());
export function operatorReady(o: OperatorInfo = OPERATOR): boolean {
  try {
    if (o === OPERATOR && import.meta.env?.DEV && localStorage.getItem('slides:dev-operator') === '1') return true; // dev-only switch for tests
  } catch {
    /* no storage */
  }
  return missingOperatorFields(o).length === 0;
}
