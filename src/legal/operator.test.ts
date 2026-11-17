import { describe, expect, it } from 'vitest';
import { disclosureOk, missingOperatorFields, OPERATOR, operatorReady, operatorWarnings, type OperatorInfo } from './operator';

const full: OperatorInfo = {
  name: 'Taro Example',
  tradeName: '',
  representative: 'Taro Example',
  address: { mode: 'on-request' },
  phone: { mode: 'on-request' },
  email: 'support@example.com',
  supportHours: '',
  tax: 'inclusive',
  invoiceNumber: '',
  court: '',
  effectiveDate: '2026-12-01',
};

describe('operator details gate paid subscriptions', () => {
  it('the shipped details are all empty: nothing is invented, and purchases stay off', () => {
    expect(OPERATOR.name).toBe('');
    expect(OPERATOR.representative).toBe('');
    expect(OPERATOR.address).toBeNull();
    expect(OPERATOR.phone).toBeNull();
    expect(OPERATOR.email).toBe('');
    expect(OPERATOR.tax).toBeNull();
    expect(OPERATOR.effectiveDate).toBe('');
    expect(missingOperatorFields(OPERATOR).sort()).toEqual(['address', 'effectiveDate', 'email', 'name', 'phone', 'representative', 'tax']);
    expect(operatorReady(OPERATOR)).toBe(false);
  });

  it('is ready when every required item is set (address and phone may be "on request")', () => {
    expect(missingOperatorFields(full)).toEqual([]);
    expect(operatorReady(full)).toBe(true);
    expect(operatorReady({ ...full, address: { mode: 'public', value: '1-2-3 Example, Tokyo' }, phone: { mode: 'public', value: '03-0000-0000' } })).toBe(true);
  });

  it('every required item is really required', () => {
    expect(missingOperatorFields({ ...full, name: '  ' })).toEqual(['name']);
    expect(missingOperatorFields({ ...full, representative: '' })).toEqual(['representative']);
    expect(missingOperatorFields({ ...full, address: null })).toEqual(['address']); // "not decided" is not an answer
    expect(missingOperatorFields({ ...full, phone: null })).toEqual(['phone']);
    expect(missingOperatorFields({ ...full, address: { mode: 'public', value: ' ' } })).toEqual(['address']); // public but empty
    expect(missingOperatorFields({ ...full, tax: null })).toEqual(['tax']);
    expect(missingOperatorFields({ ...full, effectiveDate: '' })).toEqual(['effectiveDate']);
    expect(missingOperatorFields({ ...full, effectiveDate: '2026-13-45' })).toEqual(['effectiveDate']);
    expect(missingOperatorFields({ ...full, effectiveDate: '17/11/2026' })).toEqual(['effectiveDate']);
  });

  it('the e-mail must look like one (it is also where requests for address/phone are sent)', () => {
    for (const bad of ['', 'nobody', 'a@b', '@example.com', 'a b@example.com']) expect(missingOperatorFields({ ...full, email: bad }), bad).toEqual(['email']);
    expect(missingOperatorFields({ ...full, email: 'a@b.jp' })).toEqual([]);
  });

  it('a malformed invoice registration number is refused, an empty one is fine', () => {
    expect(operatorWarnings({ ...full, invoiceNumber: '' })).toEqual([]);
    expect(operatorWarnings({ ...full, invoiceNumber: 'T1234567890123' })).toEqual([]);
    expect(operatorWarnings({ ...full, invoiceNumber: '1234567890123' })).toHaveLength(1);
    expect(operatorReady({ ...full, invoiceNumber: 'T123' })).toBe(false);
  });

  it('disclosure choices', () => {
    expect(disclosureOk(null)).toBe(false);
    expect(disclosureOk({ mode: 'on-request' })).toBe(true);
    expect(disclosureOk({ mode: 'public', value: 'x' })).toBe(true);
    expect(disclosureOk({ mode: 'public', value: '' })).toBe(false);
  });
});
