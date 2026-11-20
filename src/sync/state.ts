import { useSyncExternalStore } from 'react';
import { getAccount, subscribeAccount } from '../account/store';
import { gatingOn } from '../premium/entitlement';
import { artLocalStore } from '../games/art-slide/storage';
import { driveClient } from './drive';
import { syncOnce, type LocalStore, type SyncOutcome } from './engine';
import { forgetDriveToken, getDriveToken, revokeDriveAccess } from './gis';

/**
 * Google Drive sync, kept apart from billing: it only moves play records between this device and the signed-in
 * visitor's own Drive. It is OFF until the visitor turns it on (which asks Google for Drive access separately).
 * Records on the device are never deleted by any sync, sign-out or switch-off.
 */
const KEY = 'slides:sync';
const BACKUP_KEY = 'artslide:save:before-sync';

export interface SyncPref {
  enabled: boolean;
  /** The account (our own user id) whose Drive this device syncs with. */
  owner: string | null;
  lastSyncAt: number | null;
}
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error' | 'needs-consent' | 'other-account' | 'newer-version' | 'unavailable';
export interface SyncState extends SyncPref { status: SyncStatus }

function loadPref(): SyncPref {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SyncPref> | null;
    return { enabled: !!p?.enabled, owner: typeof p?.owner === 'string' ? p.owner : null, lastSyncAt: typeof p?.lastSyncAt === 'number' ? p.lastSyncAt : null };
  } catch {
    return { enabled: false, owner: null, lastSyncAt: null };
  }
}
function savePref(p: SyncPref) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

let state: SyncState = { ...loadPref(), status: 'off' };
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  savePref({ enabled: state.enabled, owner: state.owner, lastSyncAt: state.lastSyncAt });
  listeners.forEach((l) => l());
};
export const getSyncState = (): SyncState => state;
export function useSyncState(): SyncState {
  return useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), getSyncState);
}

const clientId = (): string | null => getAccount().config.googleClientId ?? null;
export const syncAvailable = (): boolean => !!clientId();

/** Is this device allowed to sync right now? (signed in, switched on, and the records belong to this account) */
function eligibility(): 'ok' | 'off' | 'signed-out' | 'other-account' {
  const me = getAccount().me;
  if (!state.enabled) return 'off';
  if (!me?.signedIn || !me.id) return 'signed-out';
  if (state.owner && state.owner !== me.id) return 'other-account';
  return 'ok';
}

let running = false;
let timer: number | undefined;
let backoff = 0;
const BACKOFF_STEPS = [30_000, 120_000, 600_000];
/**
 * Asking Google for a token without a click opens a small Google window for an instant (it flashes the sign-in page and closes), and the
 * token is only kept in memory, so every reload would flash it. A page load or a return to the tab therefore syncs only when the last
 * sync is older than this; changes (a clear, a star) and the "Sync now" button still sync at once.
 */
const STALE_MS = 30 * 60_000;
const isFresh = (): boolean => !!state.lastSyncAt && Date.now() - state.lastSyncAt < STALE_MS;

export function localStore(): LocalStore {
  return artLocalStore;
}

async function runOnce(local: LocalStore = localStore()): Promise<SyncOutcome | null> {
  const el = eligibility();
  if (el === 'other-account') {
    set({ status: 'other-account' });
    return null;
  }
  if (el !== 'ok' || running || !clientId() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  running = true;
  set({ status: 'syncing' });
  try {
    const out = await syncOnce({ drive: driveClient(), getToken: () => getDriveToken(clientId()!, false, getAccount().me?.googleSub), local });
    if (out.status === 'ok') {
      backoff = 0;
      set({ status: 'ok', lastSyncAt: Date.now() });
    } else if (out.status === 'error') {
      set({ status: 'error' });
      scheduleRetry();
    } else set({ status: out.status });
    return out;
  } finally {
    running = false;
  }
}

function scheduleRetry() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void runOnce(), BACKOFF_STEPS[Math.min(backoff++, BACKOFF_STEPS.length - 1)]);
}

/** After a clear (or any change worth keeping): sync soon, but not on every move. */
export function scheduleSync(delayMs = 3000): void {
  if (eligibility() !== 'ok') return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void runOnce(), delayMs);
}

export const syncNow = (): Promise<SyncOutcome | null> => runOnce();

/** Keeps a copy of the device's records from before the very first sync (an easy way back; never needed in normal use). */
function backupOnce() {
  try {
    if (localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, localStorage.getItem('artslide:save') ?? '');
  } catch {
    /* no room: sync still never deletes anything */
  }
}

/** Turn sync on (needs a click: Google asks for Drive access). */
export async function enableSync(): Promise<boolean> {
  const me = getAccount().me;
  const id = clientId();
  if (!me?.signedIn || !me.id || !id) return false;
  const t = await getDriveToken(id, true, me.googleSub);
  if (!t) {
    set({ status: 'needs-consent' });
    return false;
  }
  backupOnce();
  set({ enabled: true, owner: me.id, status: 'idle' });
  await runOnce();
  return true;
}

/** Reconnect after the token expired or access was withdrawn at Google. */
export async function reconnectSync(): Promise<boolean> {
  const id = clientId();
  if (!id) return false;
  const t = await getDriveToken(id, true, getAccount().me?.googleSub);
  if (!t) return false;
  await runOnce();
  return true;
}

/** Turn sync off: Drive access is withdrawn; the records on the device and the file in Drive stay as they are. */
export async function disableSync(): Promise<void> {
  window.clearTimeout(timer);
  await revokeDriveAccess();
  set({ enabled: false, owner: null, status: 'off' });
}

/** This device's records may go to the signed-in account's Drive although they were last synced with another account. */
export async function useDeviceForThisAccount(): Promise<boolean> {
  const me = getAccount().me;
  if (!me?.signedIn || !me.id) return false;
  set({ owner: me.id });
  return enableSync();
}

/** Signing out stops syncing and forgets the token; nothing on the device is touched. */
export function onSignedOut(): void {
  window.clearTimeout(timer);
  forgetDriveToken();
  set({ status: state.enabled ? 'idle' : 'off' });
}

let started = false;
export function initSync(): void {
  if (started || !gatingOn()) return;
  started = true;
  const reevaluate = () => {
    const el = eligibility();
    if (el === 'ok') { if (isFresh()) set({ status: 'ok' }); else void runOnce(); }
    else if (el === 'other-account') set({ status: 'other-account' });
    else if (el === 'signed-out') onSignedOut();
    else set({ status: 'off' });
  };
  subscribeAccount(reevaluate);
  window.addEventListener('online', () => { if (!isFresh()) void runOnce(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !isFresh()) void runOnce();
  });
  reevaluate();
}
