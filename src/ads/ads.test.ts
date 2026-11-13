import { describe, expect, it } from 'vitest';
import { AD_UNITS, DESKTOP_MIN_WIDTH, adFits, adFrameHtml, adFrameUrl, adScriptUrl, chooseAdUnit } from './admax';
import { adsAllowed, consentRequired } from './consent';

describe('ad units', () => {
  it('uses the two AdMax tags exactly as issued, both 300x250', () => {
    expect(AD_UNITS.desktop).toEqual({ id: 'desktop', tag: 'a1c2070f42cfa5a3fc12867425b874ed', width: 300, height: 250 });
    expect(AD_UNITS.mobile).toEqual({ id: 'mobile', tag: 'e17c874ec991654a2894f1c609f8c486', width: 300, height: 250 });
    expect(adScriptUrl(AD_UNITS.desktop)).toBe('https://adm.shinobi.jp/s/a1c2070f42cfa5a3fc12867425b874ed');
  });
  it('picks the PC tag from 728px up and the phone tag below', () => {
    expect(DESKTOP_MIN_WIDTH).toBe(728);
    expect(chooseAdUnit(1920).id).toBe('desktop');
    expect(chooseAdUnit(728).id).toBe('desktop');
    expect(chooseAdUnit(727).id).toBe('mobile');
    expect(chooseAdUnit(412).id).toBe('mobile');
  });
  it('shows no ad (and shrinks nothing) on screens narrower than the unit', () => {
    expect(adFits(299)).toBe(false);
    expect(adFits(280)).toBe(false);
    expect(adFits(300)).toBe(true);
    expect(adFits(375)).toBe(true);
    expect(adFits(1280)).toBe(true);
  });
});

describe('ad frame page (runs inside its own iframe)', () => {
  for (const unit of Object.values(AD_UNITS)) {
    it(`${unit.id}: exactly one AdMax script, nothing else`, () => {
      const doc = adFrameHtml(unit);
      expect(doc).toContain(`<script src="https://adm.shinobi.jp/s/${unit.tag}"></script>`);
      expect(doc.match(/<script/g)).toHaveLength(1);
      expect(doc).not.toMatch(/adsterra|bauval|atOptions|popunder|socialbar|window\.open|top\.location/i);
      expect(doc).not.toContain(unit.id === 'mobile' ? AD_UNITS.desktop.tag : AD_UNITS.mobile.tag); // no cross-talk between tags
    });
  }
  it('each unit has its own page on our domain', () => {
    expect(adFrameUrl(AD_UNITS.mobile)).toBe('/ads/mobile.html');
    expect(adFrameUrl(AD_UNITS.desktop)).toBe('/ads/desktop.html');
  });
  it('refuses a malformed tag', () => {
    expect(() => adFrameHtml({ ...AD_UNITS.mobile, tag: '"></script><script>alert(1)</script>' })).toThrow();
  });
});

describe('regional consent', () => {
  it('requires opt-in in Europe (time zone or browser region) and when unsure', () => {
    expect(consentRequired('Europe/Berlin', ['de-DE'])).toBe(true);
    expect(consentRequired('Europe/London', ['en-GB'])).toBe(true);
    expect(consentRequired('Europe/Zurich', ['en-US'])).toBe(true);
    expect(consentRequired('Atlantic/Canary', ['es-ES'])).toBe(true);
    expect(consentRequired('Asia/Tokyo', ['de-DE'])).toBe(true); // European browser region
    expect(consentRequired(undefined, ['en-US'])).toBe(true);
  });
  it('does not require it elsewhere', () => {
    expect(consentRequired('Asia/Tokyo', ['ja-JP', 'en-US'])).toBe(false);
    expect(consentRequired('America/New_York', ['en-US'])).toBe(false);
    expect(consentRequired('Australia/Sydney', ['en'])).toBe(false);
  });
  it('a visitor choice always wins; otherwise opt-in regions wait, others proceed', () => {
    expect(adsAllowed(null, true)).toBe(false);
    expect(adsAllowed(null, false)).toBe(true);
    expect(adsAllowed(true, true)).toBe(true);
    expect(adsAllowed(false, false)).toBe(false);
    expect(adsAllowed(false, true)).toBe(false);
  });
});
