import { describe, expect, it } from 'vitest';
import { missingOperatorFields, OPERATOR, operatorReady } from './operator';

describe('operator details gate paid subscriptions', () => {
  const full = { businessName: 'A', representative: 'B', address: 'C', phone: 'D', email: 'E' };
  it('are not ready until every required field is filled', () => {
    expect(operatorReady(full)).toBe(true);
    for (const k of Object.keys(full) as (keyof typeof full)[]) {
      expect(operatorReady({ ...full, [k]: '' })).toBe(false);
      expect(operatorReady({ ...full, [k]: '   ' })).toBe(false);
      expect(missingOperatorFields({ ...full, [k]: '' })).toEqual([k]);
    }
  });
  it('the committed details are never invented: the shipped object holds strings only (empty until the operator supplies them)', () => {
    for (const v of Object.values(OPERATOR)) expect(typeof v).toBe('string');
  });
});
