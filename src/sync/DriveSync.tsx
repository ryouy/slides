import { useState, type ReactNode } from 'react';
import { getAccount, useAccount } from '../account/store';
import { useLang, useT } from '../i18n';
import { disableSync, enableSync, reconnectSync, syncNow, useDeviceForThisAccount, useSyncState } from './state';

/** Optional Google Drive backup/sync of the play records (Account page). Off until the visitor turns it on. */
export function DriveSync({ children }: { children?: ReactNode }) {
  const t = useT();
  const lang = useLang();
  const { config } = useAccount();
  const s = useSyncState();
  const [busy, setBusy] = useState(false);
  if (!config.googleClientId || !getAccount().me?.signedIn) return children ? <div className="account-row">{children}</div> : null;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const time = s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString(lang) : '';
  const line =
    s.status === 'syncing' ? t('sync.syncing')
    : s.status === 'ok' ? t('sync.ok', { time })
    : s.status === 'error' ? t('sync.error')
    : s.status === 'needs-consent' ? t('sync.consent')
    : s.status === 'other-account' ? t('sync.other')
    : s.status === 'newer-version' ? t('sync.newer')
    : '';
  return (
    <section className="drive-sync" data-testid="sync">
      <h3>{t('sync.title')}</h3>
      <p className="muted">{t('sync.desc')}</p>
      {s.enabled && line && <p className="muted" role="status" data-testid="sync-status" data-status={s.status}>{line}</p>}
      {s.enabled && s.status === 'needs-consent' && <button className="btn wide" data-testid="sync-reconnect" disabled={busy} onClick={() => run(reconnectSync)}>{t('sync.reconnect')}</button>}
      {s.enabled && s.status === 'other-account' && <button className="btn wide" data-testid="sync-use-device" disabled={busy} onClick={() => run(useDeviceForThisAccount)}>{t('sync.useDevice')}</button>}
      {s.enabled && s.status !== 'other-account' && s.status !== 'needs-consent' && <button className="btn wide" data-testid="sync-now" disabled={busy || s.status === 'syncing'} onClick={() => run(syncNow)}>{t('sync.now')}</button>}
      {/* the sync switch and Sign out side by side */}
      <div className="account-row">
        {!s.enabled ? (
          <button className="btn" data-testid="sync-enable" disabled={busy} onClick={() => run(enableSync)}>{t('sync.enable')}</button>
        ) : (
          <button className="btn" data-testid="sync-disable" disabled={busy} onClick={() => run(disableSync)}>{t('sync.disable')}</button>
        )}
        {children}
      </div>
      {s.enabled && <p className="muted premium-note">{t('sync.offNote')}</p>}
    </section>
  );
}
