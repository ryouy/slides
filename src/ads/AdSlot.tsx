import { Link } from '../components/Link';
import { adsForcedLive } from '../components/AdBanner';
import { useT } from '../i18n';
import { adsEnabled } from './admax';
import { useAdConsent } from './consent';

export { AdBanner as AdSlot } from '../components/AdBanner';

/** Opt-in banner for regions that require consent before ad cookies (EU/EEA, UK, Switzerland). */
export function ConsentBanner() {
  const t = useT();
  const { required, consent, set } = useAdConsent();
  if (!(adsEnabled() || adsForcedLive()) || !required || consent !== null) return null;
  return (
    <div className="consent" role="dialog" aria-label={t('consent.text')}>
      <p>{t('consent.text')} <Link to="/privacy">{t('common.privacy')}</Link></p>
      <div className="row">
        <button className="btn" data-testid="consent-decline" onClick={() => set(false)}>{t('consent.decline')}</button>
        <button className="btn primary" data-testid="consent-accept" onClick={() => set(true)}>{t('consent.accept')}</button>
      </div>
    </div>
  );
}
