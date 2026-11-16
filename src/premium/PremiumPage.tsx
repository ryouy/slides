import { useEffect } from 'react';
import { LockIcon } from '../components/Icons';
import { refreshAccount } from '../account/store';
import { Link } from '../components/Link';
import { useT } from '../i18n';
import { go } from '../router';
import { Page } from '../ui/Pages';
import { useAccount } from '../account/store';
import { canSubscribe, openPortal, startCheckout } from './billing';
import { useEntitlement } from './entitlement';

/** The Premium offer: price, what it includes and how it renews. `reason` explains a lock the visitor just ran into. */
export function PremiumPanel({ reason }: { reason?: 'art' | 'size' | 'photos' }) {
  const t = useT();
  const { premium } = useEntitlement();
  const { config, me } = useAccount();
  const available = canSubscribe(config);
  return (
    <div className="premium" data-testid="premium">
      {reason && <p className="premium-reason" data-testid="premium-reason"><LockIcon size={16} /> {t(reason === 'art' ? 'premium.lockedArt' : reason === 'photos' ? 'premium.lockedPhotos' : 'premium.lockedSize')}</p>}
      <p className="premium-price"><b>{t('premium.price')}</b></p>
      <ul className="premium-list">
        <li>{t('premium.f1')}</li>
        <li>{t('premium.f2')}</li>
        <li>{t('premium.f3')}</li>
        <li>{t('premium.f4')}</li>
      </ul>
      {premium ? (
        <>
          <p className="premium-on" data-testid="premium-active">✓ {t('premium.active')}</p>
          <button className="btn wide" data-testid="premium-manage" onClick={() => void openPortal()}>{t('acct.manage')}</button>
        </>
      ) : (
        <button className="btn primary wide" data-testid="premium-subscribe" disabled={!available} onClick={() => void startCheckout()}>{t('premium.subscribe')}</button>
      )}
      {!available && !premium && <p className="muted" data-testid="premium-soon">{t('premium.soon')}</p>}
      {available && !premium && !me?.signedIn && <p className="muted" data-testid="premium-signin">{t('premium.signIn')}</p>}
      <p className="muted premium-note">{t('premium.note')}</p>
      <p className="muted premium-note">{t('premium.free')}</p>
      <p className="muted premium-note"><Link to="/terms">{t('common.terms')}</Link> · <Link to="/privacy">{t('common.privacy')}</Link> · <Link to="/commerce">特定商取引法に基づく表記</Link></p>
    </div>
  );
}

export function PremiumPage() {
  const t = useT();
  const { premium } = useEntitlement();
  const back = typeof location !== 'undefined' && new URLSearchParams(location.search).get('checkout') === 'success';
  // back from Stripe: Premium is granted by the server's record (the webhook), not by this page, so ask again for a little while
  useEffect(() => {
    if (!back || premium) return;
    let n = 0;
    const id = window.setInterval(() => {
      void refreshAccount(true);
      if (++n >= 8) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [back, premium]);
  return (
    <Page title={t('premium.title')}>
      {back && !premium && <p className="muted" role="status" data-testid="premium-thanks">{t('premium.thanks')}</p>}
      <PremiumPanel />
      <button className="btn wide" onClick={() => go('gallery')}>{t('art.change')}</button>
    </Page>
  );
}

