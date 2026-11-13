import { memo, useEffect, useMemo, useState } from 'react';
import { adScale, adSrcDoc, adsEnabled, chooseAdUnit } from '../ads/adsterra';
import { useAdConsent } from '../ads/consent';
import { useT } from '../i18n';

/** In the dev server real ads are never requested; `?ads=live` (dev only) lets tests exercise the iframe with mocked scripts. */
export const adsForcedLive = (): boolean => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('ads') === 'live';

function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setW(window.innerWidth));
    };
    window.addEventListener('resize', on);
    on();
    return () => {
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return w;
}

/** At most one banner per page: the first one mounted owns the slot until it unmounts. */
let slotOwner: symbol | null = null;
function useSlot(): boolean {
  const [owns, setOwns] = useState(false);
  useEffect(() => {
    const id = Symbol('ad-slot');
    if (!slotOwner) {
      slotOwner = id;
      setOwns(true);
    }
    return () => {
      if (slotOwner === id) slotOwner = null;
    };
  }, []);
  return owns;
}

/**
 * The ad area shared by all games, placed below the board and controls.
 *  - 728x90 on screens >= 728px wide, 300x250 below (scaled down on screens narrower than 316px)
 *  - the ad runs in its own sandboxed iframe: it cannot touch the page, navigate it, or clash with the
 *    other unit's global `atOptions`; if it fails or is blocked the game is unaffected
 *  - dev server: a placeholder. Production: nothing at all unless VITE_ADS_ENABLED=true, and then only
 *    when the visitor's consent status allows it
 */
export const AdBanner = memo(function AdBanner() {
  const t = useT();
  const owns = useSlot();
  const width = useViewportWidth();
  const { allowed } = useAdConsent();
  const unit = chooseAdUnit(width);
  const scale = adScale(unit, width);
  const live = adsEnabled() || adsForcedLive();
  const srcDoc = useMemo(() => adSrcDoc(unit), [unit]);

  if (!owns) return null;
  const placeholder = import.meta.env.DEV && !adsForcedLive();
  if (!placeholder && !(live && allowed)) return null;

  return (
    <aside className="ad-box" data-testid="ad-box" data-unit={unit.id} aria-label={t('ad.label')}>
      <span className="ad-label">{t('ad.label')}</span>
      <div className="ad-frame" style={{ width: unit.width * scale, height: unit.height * scale }}>
        {placeholder ? (
          <div className="ad-placeholder" data-testid="ad-placeholder" style={{ width: unit.width, height: unit.height, transform: `scale(${scale})` }}>
            {unit.width}×{unit.height}
          </div>
        ) : (
          <iframe
            key={unit.id}
            title={t('ad.label')}
            data-testid="ad-iframe"
            srcDoc={srcDoc}
            width={unit.width}
            height={unit.height}
            loading="lazy"
            // scripts and click-through popups only: no same-origin access to the page, no top navigation
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            style={{ width: unit.width, height: unit.height, transform: `scale(${scale})` }}
          />
        )}
      </div>
    </aside>
  );
});
