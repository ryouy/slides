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
  // short: "11/20 16:25" (the year and the seconds are not needed)
  const time = s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString(lang, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const line =
    s.status === 'syncing' ? t('sync.syncing')
    : s.status === 'ok' ? t('sync.ok', { time })
    : s.status === 'error' ? t('sync.error')
    : s.status === 'needs-consent' ? t('sync.consent')
    : s.status === 'other-account' ? t('sync.other')
    : s.status === 'newer-version' ? t('sync.newer')
    : '';
  const inButton = s.status === 'ok' || s.status === 'syncing';
  return (
    <section className="drive-sync" data-testid="sync">
      <h3>{t('sync.title')}</h3>
      {/* when it last synced sits inside the Sync now button; only trouble gets a line of its own */}
      {s.enabled && line && !inButton && <p className="muted" role="status" data-testid="sync-status" data-status={s.status}>{line}</p>}
      {s.enabled && s.status === 'needs-consent' && <button className="btn wide" data-testid="sync-reconnect" disabled={busy} onClick={() => run(reconnectSync)}>{t('sync.reconnect')}</button>}
      {s.enabled && s.status === 'other-account' && <button className="btn wide" data-testid="sync-use-device" disabled={busy} onClick={() => run(useDeviceForThisAccount)}>{t('sync.useDevice')}</button>}
      {s.enabled && s.status !== 'other-account' && s.status !== 'needs-consent' && <button className="btn wide sync-now" data-testid="sync-now" disabled={busy || s.status === 'syncing'} onClick={() => run(syncNow)}>
        <span>{t('sync.now')}</span>
        {line && inButton && <small className="sync-when" role="status" data-testid="sync-status" data-status={s.status}>{line}</small>}
      </button>}
      {/* the sync switch and Sign out side by side */}
      <div className="account-row">
        {!s.enabled ? (
          <button className="btn" data-testid="sync-enable" disabled={busy} onClick={() => run(enableSync)}>{t('sync.enable')}</button>
        ) : (
          <button className="btn" data-testid="sync-disable" disabled={busy} onClick={() => run(disableSync)}>{t('sync.disable')}</button>
        )}
        {children}
      </div>
    </section>
  );
}
