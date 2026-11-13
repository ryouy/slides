import { useSave } from '../storage/SaveContext';

/** Countries where ad cookies need prior opt-in (EU/EEA, UK, Switzerland). */
const OPT_IN_REGIONS = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', 'GB', 'CH',
]);
const EXTRA_TIMEZONES = new Set(['Atlantic/Azores', 'Atlantic/Madeira', 'Atlantic/Canary', 'Atlantic/Reykjavik', 'Africa/Ceuta', 'Asia/Nicosia', 'Asia/Famagusta']);

/**
 * Do ads need the visitor's opt-in first? Decided on the device (no server): European time zones or
 * a European browser region mean yes, and so does anything unknown (the careful default).
 */
export function consentRequired(timeZone: string | undefined, languages: readonly string[]): boolean {
  if (!timeZone) return true;
  if (timeZone.startsWith('Europe/') || EXTRA_TIMEZONES.has(timeZone)) return true;
  return languages.some((l) => {
    const region = l.split('-')[1]?.toUpperCase();
    return !!region && OPT_IN_REGIONS.has(region);
  });
}

/** Opt-in regions need a "yes"; elsewhere ads run until the visitor says "no". A choice always wins. */
export const adsAllowed = (consent: boolean | null, required: boolean): boolean => consent === true || (consent === null && !required);

export function deviceConsentRequired(): boolean {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  return consentRequired(tz, typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []);
}

export function useAdConsent() {
  const { data, update } = useSave();
  const required = deviceConsentRequired();
  const consent = data.settings.adConsent;
  return {
    required,
    consent,
    allowed: adsAllowed(consent, required),
    set: (v: boolean) => update((d) => ({ ...d, settings: { ...d.settings, adConsent: v } })),
  };
}
