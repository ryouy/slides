import { describe, expect, it } from 'vitest';
import { AD_UNITS, DEFAULT_SCRIPT_BASE, DESKTOP_MIN_WIDTH, adFits, adFrameUrl, adFrameHtml, chooseAdUnit } from './adsterra';
import { adsAllowed, consentRequired } from './consent';

describe('ad units', () => {
  it('uses the two Adsterra units exactly as configured', () => {
    expect(AD_UNITS.mobile).toEqual({ id: 'mobile', key: '7ce68b5c8c3484d811e70436814e1b1c', width: 300, height: 250 });
    expect(AD_UNITS.desktop).toEqual({ id: 'desktop', key: 'd1f4ebc3ac6f4fa67d18ad875ecc8e1f', width: 728, height: 90 });
  });
  it('picks 728x90 from 728px up and 300x250 below', () => {
    expect(DESKTOP_MIN_WIDTH).toBe(728);
    expect(chooseAdUnit(1920).id).toBe('desktop');
    expect(chooseAdUnit(728).id).toBe('desktop');
    expect(chooseAdUnit(727).id).toBe('mobile');
    expect(chooseAdUnit(412).id).toBe('mobile');
    expect(chooseAdUnit(280).id).toBe('mobile');
  });
  it('shows no ad (and shrinks nothing) on screens narrower than the smallest unit', () => {
    expect(adFits(299)).toBe(false);
    expect(adFits(280)).toBe(false);
    expect(adFits(300)).toBe(true);
    expect(adFits(375)).toBe(true);
    expect(adFits(1280)).toBe(true);
  });
});

describe('ad frame page (runs inside its own iframe)', () => {
  for (const unit of Object.values(AD_UNITS)) {
    it(`${unit.id}: own atOptions, exactly one invoke script, nothing else`, () => {
      const doc = adFrameHtml(unit);
      expect(doc).toContain(`atOptions={'key':'${unit.key}','format':'iframe','height':${unit.height},'width':${unit.width},'params':{}};`);
      expect(doc).toContain(`<script src="${DEFAULT_SCRIPT_BASE}/${unit.key}"></script>`);
      expect(doc.match(/<script/g)).toHaveLength(2); // the options and the ad: no extra formats
      expect(doc).not.toMatch(/popunder|socialbar|onclick|window\.open|top\.location/i);
      expect(doc).not.toContain(unit.id === 'mobile' ? AD_UNITS.desktop.key : AD_UNITS.mobile.key); // no cross-talk between units
    });
  }
  it('each unit has its own page on our domain', () => {
    expect(adFrameUrl(AD_UNITS.mobile)).toBe('/ads/mobile.html');
    expect(adFrameUrl(AD_UNITS.desktop)).toBe('/ads/desktop.html');
  });
  it('uses a custom script host and refuses malformed keys', () => {
    expect(adFrameHtml(AD_UNITS.mobile, 'https://ads.example.net/x')).toContain('<script src="https://ads.example.net/x/7ce68b5c8c3484d811e70436814e1b1c"></script>');
    expect(() => adFrameHtml({ ...AD_UNITS.mobile, key: "x'};alert(1);//" })).toThrow();
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
