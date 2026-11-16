import { useState } from 'react';
import { useLang, useT } from '../i18n';
import { go } from '../router';
import { canSubscribe, openPortal, startCheckout } from '../premium/billing';
import { useEntitlement } from '../premium/entitlement';
import { Page } from '../ui/Pages';
import { postJson, signInUrl } from './api';
import { DriveSync } from '../sync/DriveSync';
import { refreshAccount, useAccount } from './store';

/** Contract states in which the portal (payment method, cancel) is what the visitor needs. */
const OPEN = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

/** Account: Google sign-in, plan and subscription management. Shown only when the paid plan is switched on. */
export function AccountPage() {
  const t = useT();
  const lang = useLang();
  const { gating, premium } = useEntitlement();
  const { config, me, ready } = useAccount();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    setError(false);
    if (!(await fn())) setError(true);
    setBusy(false);
  };
  const date = (sec?: number | null) => (sec ? new Date(sec * 1000).toLocaleDateString(lang) : '');

  const signOut = () => run(async () => {
    const r = await postJson<{ ok: boolean }>('/api/auth/logout');
    await refreshAccount();
    return !!r;
  });
  const deleteAccount = () => {
    if (!window.confirm(t('acct.deleteConfirm'))) return;
    void run(async () => {
      const r = await postJson<{ deleted: boolean }>('/api/account/delete');
      await refreshAccount();
      return !!r;
    });
  };

  return (
    <Page title={t('acct.title')}>
      <div className="account" data-testid="account">
        {!gating || (ready && !config.auth) ? (
          <p className="muted" data-testid="account-unavailable">{t('acct.unavailable')}</p>
        ) : !ready ? (
          <p className="muted">…</p>
        ) : !me?.signedIn ? (
          <a className="btn primary wide" data-testid="signin" href={signInUrl('/art-slide/account')}>{t('acct.signIn')}</a>
        ) : (
          <>
            <p className="account-name" data-testid="account-name"><b>{me.name ?? 'Google'}</b></p>
            <p className="muted" data-testid="account-plan">
              {premium
                ? t(me.cancelAtPeriodEnd ? 'acct.premiumEnds' : 'acct.premiumRenews', { date: date(me.currentPeriodEnd) })
                : t('acct.free')}
            </p>
            {premium || OPEN.has(me.status ?? '') ? (
              <button className="btn wide" data-testid="manage" disabled={busy} onClick={() => run(openPortal)}>{t('acct.manage')}</button>
            ) : (
              // no contract, or one that has ended: subscribing (again) is offered
              canSubscribe(config) && <button className="btn primary wide" data-testid="account-subscribe" disabled={busy} onClick={() => run(startCheckout)}>{t('premium.subscribe')}</button>
            )}
            <DriveSync />
            <button className="btn wide" data-testid="signout" disabled={busy} onClick={signOut}>{t('acct.signOut')}</button>
            <button className="link-quiet" data-testid="delete-account" disabled={busy} onClick={deleteAccount}>{t('acct.delete')}</button>
          </>
        )}
        {error && <p className="muted" role="alert" data-testid="account-error">{t('acct.error')}</p>}
        <button className="btn wide" onClick={() => go('')}>{t('common.back')}</button>
      </div>
    </Page>
  );
}
