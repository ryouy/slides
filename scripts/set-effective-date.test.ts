import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error plain .mjs helper
import { jstToday, validDate, withEffectiveDate } from './set-effective-date.mjs';

describe('set-effective-date', () => {
  const src = readFileSync(new URL('../src/legal/operator.ts', import.meta.url), 'utf8');
  it('changes only the effectiveDate line of the real operator file', () => {
    const out: string = withEffectiveDate(src, '2026-12-01');
    expect(out).toContain("\n  effectiveDate: '2026-12-01',");
    expect(out.replace("effectiveDate: '2026-12-01'", "effectiveDate: ''")).toBe(src.replace(/effectiveDate: '[^']*',/, "effectiveDate: '',"));
  });
  it('can be run again with another date', () => {
    expect(withEffectiveDate(withEffectiveDate(src, '2026-12-01'), '2026-12-05')).toContain("effectiveDate: '2026-12-05',");
  });
  it('refuses a bad date and a file it does not understand', () => {
    for (const bad of ['', '2026-13-01', '2026-02-30', '12/01/2026', 'tomorrow']) expect(() => withEffectiveDate(src, bad), bad).toThrow();
    expect(() => withEffectiveDate('export const X = 1;', '2026-12-01')).toThrow();
  });
  it("uses Japan's date: 15:30 UTC on Nov 16 is already Nov 17 in Japan", () => {
    expect(jstToday(Date.UTC(2026, 10, 16, 15, 30))).toBe('2026-11-17');
    expect(jstToday(Date.UTC(2026, 10, 16, 14, 30))).toBe('2026-11-16');
    expect(validDate('2026-11-17')).toBe(true);
  });
});
