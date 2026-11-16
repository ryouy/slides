import { DriveAuthError, DriveError, type DriveClient } from './drive';
import { emptyDoc, mergeDocs, type SyncDoc } from './doc';
import { fromMerged, toDoc } from './local';
import type { ArtSave } from '../games/art-slide/storage';

export type SyncOutcome =
  | { status: 'ok'; uploaded: boolean }
  /** No usable access token without asking the visitor again (never prompts by itself). */
  | { status: 'needs-consent' }
  /** The Drive file was written by a newer version of the app: left untouched. */
  | { status: 'newer-version' }
  | { status: 'error'; retryable: boolean };

export interface LocalStore {
  get(): ArtSave;
  /** Applies `fn` to the CURRENT records (so plays made while syncing are never lost). */
  update(fn: (d: ArtSave) => ArtSave): void;
}

export interface SyncDeps {
  drive: DriveClient;
  /** A valid access token or null; never opens a prompt. */
  getToken(): Promise<string | null>;
  local: LocalStore;
}

const same = (a: SyncDoc, b: SyncDoc) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One sync round: read Drive, merge with the device, put the merged records back on the device, and upload
 * if Drive lacks something. The device's records are written FIRST and are only ever added to; a failed
 * upload therefore loses nothing (it is simply retried).
 */
export async function syncOnce(deps: SyncDeps): Promise<SyncOutcome> {
  try {
    const token = await deps.getToken();
    if (!token) return { status: 'needs-consent' };
    const remote = await deps.drive.read(token);
    if (remote.kind === 'unreadable') return { status: 'newer-version' };
    const remoteDoc = remote.kind === 'doc' ? remote.doc : null;

    let merged!: SyncDoc;
    deps.local.update((d) => {
      merged = mergeDocs(toDoc(d), remoteDoc ?? emptyDoc());
      return fromMerged(d, merged);
    });

    if (remoteDoc && same(remoteDoc, merged)) return { status: 'ok', uploaded: false };
    await deps.drive.write(token, merged, remote.kind === 'doc' ? remote.fileId : undefined);
    return { status: 'ok', uploaded: true };
  } catch (e) {
    if (e instanceof DriveAuthError) return { status: 'needs-consent' };
    return { status: 'error', retryable: e instanceof DriveError ? e.status === 0 || e.status >= 500 || e.status === 429 : true };
  }
}
