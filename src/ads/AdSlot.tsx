import { useEffect, useRef } from 'react';
import { useSave } from '../storage/SaveContext';
import { Link } from '../components/Link';
import { useT } from '../i18n';

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const SLOT = import.meta.env.VITE_ADSENSE_SLOT as string | undefined;

let scriptLoaded = false;
function loadScript(client: string) {
  if (scriptLoaded) return;
  scriptLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  s.onerror = () => {
    /* blocked or offline: ignore, the game never depends on ads */
  };
  document.head.appendChild(s);
}

/**
 * Ad area with a reserved height (no layout shift). Without VITE_ADSENSE_CLIENT it only
 * renders a quiet placeholder. Real ads load only after the player accepted ad cookies.
 */
export function AdSlot({ label = 'Advertisement' }: { label?: string }) {
  const { data } = useSave();
  const ref = useRef<HTMLModElement>(null);
  const consent = data.settings.adConsent === true;
  useEffect(() => {
    if (!CLIENT || !SLOT || !consent || !ref.current) return;
    try {
      loadScript(CLIENT);
      ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({});
    } catch {
      /* ignore */
    }
  }, [consent]);
  return (
    <aside className="ad-slot" aria-label={label}>
      {CLIENT && SLOT && consent ? (
        <ins ref={ref} className="adsbygoogle" style={{ display: 'block', width: '100%', height: 90 }} data-ad-client={CLIENT} data-ad-slot={SLOT} data-ad-format="horizontal" />
      ) : (
        <span className="ad-placeholder">Ad space</span>
      )}
    </aside>
  );
}

/** Cookie / ad consent banner; only shown when ads are configured. */
export function ConsentBanner() {
  const t = useT();
  const { data, update } = useSave();
  if (!CLIENT || data.settings.adConsent !== null) return null;
  const set = (v: boolean) => update((d) => ({ ...d, settings: { ...d.settings, adConsent: v } }));
  return (
    <div className="consent" role="dialog" aria-label="Cookie consent">
      <p>{t('consent.text')} <Link to="/privacy">{t('common.privacy')}</Link></p>
      <div className="row">
        <button className="btn" onClick={() => set(false)}>{t('consent.decline')}</button>
        <button className="btn primary" onClick={() => set(true)}>{t('consent.accept')}</button>
      </div>
    </div>
  );
}
