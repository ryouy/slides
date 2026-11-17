import { useEffect, useState } from 'react';
import { LockIcon } from '../components/Icons';
import { signInUrl } from '../account/api';
import { initAccount, refreshAccount, testerRequested } from '../account/store';
import { Link } from '../components/Link';
import { useLang, useT } from '../i18n';
import { disclosureNote, legalLang, planFacts } from '../legal/content';
import { withMarks } from '../legal/LegalPages';
import { OPERATOR } from '../legal/operator';
import { go } from '../router';
import { Page } from '../ui/Pages';
import { useAccount } from '../account/store';
import { openPortal, purchaseState, startCheckout } from './billing';
import { useEntitlement } from './entitlement';

/** The Premium offer: price, what it includes and how it renews. `reason` explains a lock the visitor just ran into. */
export function PremiumPanel({ reason }: { reason?: 'art' | 'size' | 'photos' }) {
  const t = useT();
  const { premium } = useEntitlement();
  const { config, me } = useAccount();
  const state = purchaseState(config, me);
  const l = legalLang(useLang());
  const [agreed, setAgreed] = useState(false);
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
      ) : state === 'off' ? null : (
        <>
          {/* what the visitor must see before the button: price, renewal, payment, total, how to cancel, refunds (特商法11条・12条の6) */}
          <section className="purchase-facts" data-testid="purchase-facts" aria-label={t('premium.beforeTitle')}>
            <h2>{t('premium.beforeTitle')}</h2>
            <dl>
              {planFacts(l, OPERATOR).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{withMarks(v)}</dd>
                </div>
              ))}
            </dl>
            <p className="muted purchase-seller" data-testid="purchase-seller">{withMarks(disclosureNote(l, OPERATOR))}</p>
            <label className="agree">
              <input type="checkbox" data-testid="premium-agree" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>{t('premium.agree')}</span>
            </label>
          </section>
          <button className="btn primary wide" data-testid="premium-subscribe" disabled={!agreed} onClick={() => void startCheckout()}>{t('premium.subscribeFull')}</button>
        </>
      )}
      {state === 'off' && !premium && <p className="muted" data-testid="premium-soon">{t('premium.soon')}</p>}
      {state === 'signin' && !premium && <p className="muted" data-testid="premium-signin">{t('premium.signIn')}</p>}
      <p className="muted premium-note">{t('premium.free')}</p>
      <p className="muted premium-note"><Link to="/terms">{t('common.terms')}</Link> · <Link to="/privacy">{t('common.privacy')}</Link> · <Link to="/commerce" data-testid="premium-commerce-link">{t('common.commerce')}</Link></p>
    </div>
  );
}

/** Shown only on /art-slide/premium?tester: what the person running the limited live test needs (their own account id for the allowlist). */
function TesterBox({ signedIn, id, canPurchase }: { signedIn: boolean; id?: string; canPurchase: boolean }) {
  return (
    <div className="purchase-facts" data-testid="tester-box">
      <h2>Limited test</h2>
      {signedIn ? (
        <>
          <p className="muted">Account ID (for PURCHASE_ALLOWLIST): <code data-testid="tester-id">{id ?? '…'}</code></p>
          <p className="muted" data-testid="tester-state">{canPurchase ? 'This account may buy.' : 'This account may not buy (yet).'}</p>
        </>
      ) : (
        <p className="muted"><a href={signInUrl(location.pathname + location.search)} data-testid="tester-signin">Sign in with Google</a> to see your account ID.</p>
      )}
    </div>
  );
}

export function PremiumPage() {
  const t = useT();
  const { premium } = useEntitlement();
  const back = typeof location !== 'undefined' && new URLSearchParams(location.search).get('checkout') === 'success';
  // back from Stripe: Premium is granted by the server's record (the webhook), not by this page, so ask again for a little while
  const tester = testerRequested();
  const { me } = useAccount();
  // the limited live test: ?tester looks the account up although the paid plan is not on in this build (the server decides who may buy)
  useEffect(() => {
    if (tester) void initAccount(true);
  }, [tester]);
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
      {tester && <TesterBox signedIn={!!me?.signedIn} id={me?.id} canPurchase={me?.canPurchase === true} />}
      <PremiumPanel />
      <button className="btn wide" onClick={() => go('gallery')}>{t('art.change')}</button>
    </Page>
  );
}

