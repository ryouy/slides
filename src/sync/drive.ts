import { normalizeDoc, type SyncDoc } from './doc';

/** Google Drive's hidden per-app folder: invisible in My Drive, only this app can read it. Needs the `drive.appdata` scope. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const FILE_NAME = 'slides-art-records.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** The access token was refused or lacks permission: the visitor has to connect Drive again. */
export class DriveAuthError extends Error {}
/** Anything else that went wrong (network, quota, server): safe to retry later. */
export class DriveError extends Error {
  constructor(public status: number) {
    super(`Drive ${status}`);
  }
}

export type RemoteState =
  | { kind: 'empty' }
  | { kind: 'doc'; fileId: string; doc: SyncDoc }
  /** The file exists but was written by a newer app version or is not a records file: it must not be overwritten. */
  | { kind: 'unreadable'; fileId: string };

export function driveClient(fetchFn: FetchFn = (i, init) => fetch(i, init)) {
  async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } });
    } catch {
      throw new DriveError(0); // offline
    }
    if (res.status === 401 || res.status === 403) throw new DriveAuthError();
    if (!res.ok) throw new DriveError(res.status);
    return res;
  }

  return {
    async read(token: string): Promise<RemoteState> {
      const q = encodeURIComponent(`name='${FILE_NAME}'`);
      const list = (await (await call(token, `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=10`)).json()) as { files?: { id: string }[] };
      const id = list.files?.[0]?.id;
      if (!id) return { kind: 'empty' };
      const raw: unknown = await (await call(token, `${API}/files/${encodeURIComponent(id)}?alt=media`)).json().catch(() => null);
      const doc = normalizeDoc(raw);
      return doc ? { kind: 'doc', fileId: id, doc } : { kind: 'unreadable', fileId: id };
    },
    async write(token: string, doc: SyncDoc, fileId?: string): Promise<string> {
      const body = JSON.stringify(doc);
      if (fileId) {
        await call(token, `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body });
        return fileId;
      }
      const boundary = `slides${Math.random().toString(36).slice(2)}`;
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const res = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: multipart });
      return ((await res.json()) as { id: string }).id;
    },
  };
}
export type DriveClient = ReturnType<typeof driveClient>;
