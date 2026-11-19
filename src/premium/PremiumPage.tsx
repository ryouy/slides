import { useEffect, useState } from 'react';
import { LockIcon } from '../components/Icons';
import { initAccount, refreshAccount, testerRequested } from '../account/store';
import { Link } from '../components/Link';
import { useLang, useT } from '../i18n';
import { disclosureNote, legalLang, planFacts } from '../legal/content';
import { withMarks } from '../legal/LegalPages';
import { OPERATOR } from '../legal/operator';
import { go } from '../router';
import { ARTWORKS } from '../games/art-slide/data';
import { Page } from '../ui/Pages';
import { useAccount } from '../account/store';
import { openPortal, purchaseState, startCheckout, type PurchaseOutcome } from './billing';
import { signInUrl } from '../account/api';
import { useEntitlement } from './entitlement';

/** Japanese and Chinese have no spaces: a line may then break anywhere. Each clause is kept whole (it moves to the next line as a unit), so a line never ends in the middle of a phrase. */
function Phrases({ text, lang }: { text: string; lang: string }) {
  if (lang !== 'ja' && lang !== 'zh') return <>{text}</>;
  return <>{text.split(/(?<=[、。，,])/).map((c, i) => <span key={i} className="phrase">{c}</span>)}</>;
}

/** A page that fades up over the current one (Escape, the backdrop or the close button dismiss it). */
function Sheet({ title, closeLabel, onClose, children }: { title: string; closeLabel: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" data-testid="purchase-sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="sheet-close" data-testid="sheet-close" aria-label={closeLabel} onClick={onClose}>×</button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** The Premium offer: price, what it includes and how it renews. `reason` explains a lock the visitor just ran into. */
export function PremiumPanel({ reason }: { reason?: 'art' | 'size' | 'photos' }) {
  const t = useT();
  const { premium } = useEntitlement();
  const { config, me } = useAccount();
  const state = purchaseState(config, me);
  const lang = useLang();
  const l = legalLang(lang);
  const [agreed, setAgreed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<PurchaseOutcome | null>(null);
  /** Runs a purchase/portal action. A failure is SHOWN (never silent): what to do, plus the short server code for support. */
  const run = async (action: () => Promise<PurchaseOutcome>) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await action();
      if (!r.ok) setProblem(r);
    } catch {
      setProblem({ ok: false, failure: 'failed', code: 'client_error' });
    }
    setBusy(false); // (on success the browser is already leaving for Stripe)
  };
  const problemEl = !problem ? null : (
        <div className="premium-error" role="alert" data-testid="checkout-error">
          <p>{t(`premium.err.${problem.failure ?? 'failed'}` as 'premium.err.failed')}</p>
          {problem.failure === 'signin' && <a className="btn wide" href={signInUrl(location.pathname + location.search)}>{t('acct.signIn')}</a>}
          {problem.failure === 'already' && <button className="btn wide" onClick={() => go('account')}>{t('home.account')}</button>}
          {problem.code && <small data-testid="checkout-error-code">{t('premium.err.code')}: {problem.code}</small>}
        </div>
  );
  return (
    <div className="premium" data-testid="premium">
      {reason && <p className="premium-reason" data-testid="premium-reason"><LockIcon size={16} /> {t(reason === 'art' ? 'premium.lockedArt' : reason === 'photos' ? 'premium.lockedPhotos' : 'premium.lockedSize')}</p>}
      <div className="premium-hero">
        <p className="premium-price"><b>{t('premium.price')}</b></p>
        <p className="premium-sub"><Phrases text={t('premium.cancelAnytime')} lang={lang} /></p>
      </div>
      <ul className="premium-list">
        <li>{t('premium.f1', { n: ARTWORKS.length })}</li>
        <li>{t('premium.f2')}</li>
        <li>{t('premium.f3')}</li>
        <li>{t('premium.f4')}</li>
      </ul>
      {premium ? (
        <>
          <p className="premium-on" data-testid="premium-active">✓ {t('premium.active')}</p>
          <button className="btn wide" data-testid="premium-manage" disabled={busy} onClick={() => void run(openPortal)}>{t('acct.manage')}</button>
        </>
      ) : state === 'off' ? null : (
        <>
          {/* the long "before you subscribe" text (特商法11条・12条の6: price, renewal, payment, total, how to cancel, refunds) sits in a sheet that
              fades in when the visitor taps the button; the final button and the agreement are inside it */}
          <button className="btn primary wide" data-testid="premium-open" aria-haspopup="dialog" onClick={() => setSheet(true)}>{t('premium.subscribeFull')}</button>
          {sheet && (
            <Sheet title={t('premium.beforeTitle')} closeLabel={t('common.close')} onClose={() => setSheet(false)}>
              <section className="purchase-facts" data-testid="purchase-facts" aria-label={t('premium.beforeTitle')}>
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
              <button className="btn primary wide" data-testid="premium-subscribe" disabled={!agreed || busy} aria-busy={busy} onClick={() => void run(startCheckout)}>{busy ? t('art.loading') : t('premium.subscribeFull')}</button>
              {problemEl}
            </Sheet>
          )}
        </>
      )}
      {!sheet && problemEl}
      {state === 'off' && !premium && <p className="muted" data-testid="premium-soon">{t('premium.soon')}</p>}
      {state === 'signin' && !premium && <p className="muted" data-testid="premium-signin">{t('premium.signIn')}</p>}
      <p className="premium-free"><Phrases text={t('premium.free')} lang={lang} /></p>
      {reason && <p className="muted premium-note"><Link to="/terms">{t('common.terms')}</Link> · <Link to="/privacy">{t('common.privacy')}</Link> · <Link to="/commerce" data-testid="premium-commerce-link">{t('common.commerce')}</Link></p>}
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
      <div className="premium-page">
        {back && !premium && <p className="premium-thanks" role="status" data-testid="premium-thanks">{t('premium.thanks')}</p>}
        {tester && <TesterBox signedIn={!!me?.signedIn} id={me?.id} canPurchase={me?.canPurchase === true} />}
        <PremiumPanel />
        <button className="btn wide premium-back" onClick={() => go('gallery')}>{t('art.change')}</button>
      </div>
    </Page>
  );
}

