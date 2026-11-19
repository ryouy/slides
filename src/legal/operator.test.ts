import { describe, expect, it } from 'vitest';
import { disclosureOk, missingOperatorFields, OPERATOR, operatorReady, operatorWarnings, validFormUrl, type OperatorInfo } from './operator';

const full: OperatorInfo = {
  legalForm: 'individual',
  name: { mode: 'on-request' },
  tradeName: '',
  representative: '',
  address: { mode: 'on-request' },
  phone: { mode: 'on-request' },
  contactFormUrl: 'https://forms.gle/example',
  email: '',
  supportHours: '',
  disclosureTarget: '',
  tax: 'inclusive',
  invoiceNumber: '',
  court: '',
  effectiveDate: '2026-12-01',
};

describe('the shipped operator details', () => {
  it('carry exactly the operator\'s decided policy and nothing invented', () => {
    expect(OPERATOR.legalForm).toBe('individual');
    expect(OPERATOR.name).toEqual({ mode: 'public', value: 'Ryo Matsushita' }); // published: Stripe's public requirements
    expect(OPERATOR.address).toEqual({ mode: 'on-request' }); // address and telephone: provided without delay on request
    expect(OPERATOR.phone).toEqual({ mode: 'on-request' });
    expect(OPERATOR.contactFormUrl).toBe('https://forms.gle/vksFVB2QUzdzKeEu6');
    expect(OPERATOR.email).toBe(''); // not published: contact form only
    expect(OPERATOR.representative).toBe('Ryo Matsushita');
    expect(OPERATOR.tradeName).toBe('');
  });
  it('tax treatment is "tax-exempt business" (as the operator stated: an individual, no registration as an invoice issuer)', () => {
    expect(OPERATOR.tax).toBe('exempt');
    expect(OPERATOR.invoiceNumber).toBe('');
  });
  it('the effective date (the real publication day) is the only item that can be open; purchases stay off until it is set', () => {
    expect(missingOperatorFields({ ...OPERATOR, effectiveDate: '' })).toEqual(['effectiveDate']);
    expect(operatorReady({ ...OPERATOR, effectiveDate: '' })).toBe(false);
    expect(operatorReady({ ...OPERATOR, effectiveDate: '2026-12-01' })).toBe(true);
    // whatever state the file is in: nothing but the date can be missing
    expect(missingOperatorFields(OPERATOR).filter((f) => f !== 'effectiveDate')).toEqual([]);
    expect(missingOperatorFields(OPERATOR).length === 0 || OPERATOR.effectiveDate === '').toBe(true);
  });
});

describe('what the notice needs before purchases may open', () => {
  it('a sole proprietor who keeps name, address and telephone for on-request disclosure is complete once tax and date are set', () => {
    expect(missingOperatorFields(full)).toEqual([]);
    expect(operatorReady(full)).toBe(true);
  });
  it('every required item is really required', () => {
    expect(missingOperatorFields({ ...full, legalForm: null })).toEqual(['legalForm']);
    expect(missingOperatorFields({ ...full, name: null })).toEqual(['name']); // "not decided" is not an answer
    expect(missingOperatorFields({ ...full, name: { mode: 'public', value: ' ' } })).toEqual(['name']);
    expect(missingOperatorFields({ ...full, address: null })).toEqual(['address']);
    expect(missingOperatorFields({ ...full, phone: null })).toEqual(['phone']);
    expect(missingOperatorFields({ ...full, tax: null })).toEqual(['tax']);
    expect(missingOperatorFields({ ...full, effectiveDate: '' })).toEqual(['effectiveDate']);
    expect(missingOperatorFields({ ...full, effectiveDate: '2026-13-45' })).toEqual(['effectiveDate']);
  });
  it('a company must name the person responsible; a sole proprietor is its own responsible person', () => {
    expect(missingOperatorFields({ ...full, legalForm: 'corporation' })).toEqual(['representative']);
    expect(missingOperatorFields({ ...full, legalForm: 'corporation', representative: 'Hanako Example' })).toEqual([]);
    expect(missingOperatorFields({ ...full, legalForm: 'individual', representative: '' })).toEqual([]);
  });
  it('the contact form must be a real https address (it is the official channel and where details are requested)', () => {
    for (const bad of ['', 'forms.gle/x', 'http://forms.gle/x', 'javascript:alert(1)', 'https://localhost', 'not a url']) expect(missingOperatorFields({ ...full, contactFormUrl: bad }), bad).toEqual(['contactFormUrl']);
    expect(validFormUrl('https://forms.gle/abc')).toBe(true);
    expect(validFormUrl('https://docs.google.com/forms/d/e/x/viewform')).toBe(true);
  });
  it('the e-mail address is optional (private by default); if given it must be valid', () => {
    expect(operatorReady({ ...full, email: '' })).toBe(true);
    expect(operatorWarnings({ ...full, email: 'support@example.com' })).toEqual([]);
    for (const bad of ['nobody', 'a@b', '@example.com']) expect(operatorReady({ ...full, email: bad }), bad).toBe(false);
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
