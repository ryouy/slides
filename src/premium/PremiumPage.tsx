import { LockIcon } from '../components/Icons';
import { Link } from '../components/Link';
import { useT } from '../i18n';
import { go } from '../router';
import { Page } from '../ui/Pages';
import { useAccount } from '../account/store';
import { startCheckout } from './billing';
import { gatingOn, useEntitlement } from './entitlement';

/** The Premium offer: price, what it includes and how it renews. `reason` explains a lock the visitor just ran into. */
export function PremiumPanel({ reason }: { reason?: 'art' | 'size' }) {
  const t = useT();
  const { premium } = useEntitlement();
  const { config, me } = useAccount();
  const available = gatingOn() && config.billing;
  return (
    <div className="premium" data-testid="premium">
      {reason && <p className="premium-reason" data-testid="premium-reason"><LockIcon size={16} /> {t(reason === 'art' ? 'premium.lockedArt' : 'premium.lockedSize')}</p>}
      <p className="premium-price"><b>{t('premium.price')}</b></p>
      <ul className="premium-list">
        <li>{t('premium.f1')}</li>
        <li>{t('premium.f2')}</li>
        <li>{t('premium.f3')}</li>
        <li>{t('premium.f4')}</li>
      </ul>
      {premium ? (
        <p className="muted">✓ Premium</p>
      ) : (
        <button className="btn primary wide" data-testid="premium-subscribe" disabled={!available} onClick={() => void startCheckout()}>{t('premium.subscribe')}</button>
      )}
      {!available && !premium && <p className="muted" data-testid="premium-soon">{t('premium.soon')}</p>}
      {available && !premium && !me?.signedIn && <p className="muted" data-testid="premium-signin">{t('premium.signIn')}</p>}
      <p className="muted premium-note">{t('premium.note')}</p>
      <p className="muted premium-note">{t('premium.free')}</p>
      <p className="muted premium-note"><Link to="/terms">{t('common.terms')}</Link> · <Link to="/privacy">{t('common.privacy')}</Link></p>
    </div>
  );
}

export function PremiumPage() {
  const t = useT();
  return (
    <Page title={t('premium.title')}>
      <PremiumPanel />
      <button className="btn wide" onClick={() => go('gallery')}>{t('art.change')}</button>
    </Page>
  );
}

