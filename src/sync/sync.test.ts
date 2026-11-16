import { describe, expect, it } from 'vitest';
import { DriveAuthError, driveClient, FILE_NAME, type FetchFn } from './drive';
import { emptyDoc, type SyncDoc } from './doc';
import { syncOnce, type LocalStore } from './engine';
import { applyDoc, toDoc } from './local';
import { defaultArtSave, type ArtSave } from '../games/art-slide/storage';

// ---- a fake Google Drive appDataFolder ----
function fakeDrive(initial?: unknown) {
  const files = new Map<string, string>();
  if (initial !== undefined) files.set('f1', JSON.stringify(initial));
  const calls: string[] = [];
  let failWith: number | 'offline' | null = null;
  const fetchFn: FetchFn = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.replace('https://www.googleapis.com', '')}`);
    if (failWith === 'offline') throw new TypeError('network');
    if (failWith) return new Response('{}', { status: failWith });
    expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer /);
    if (url.includes('/drive/v3/files?') && !url.includes('/upload/')) {
      expect(url).toContain('spaces=appDataFolder'); // the hidden app folder, never My Drive
      return new Response(JSON.stringify({ files: files.size ? [{ id: 'f1' }] : [] }));
    }
    if (url.includes('/drive/v3/files/f1?alt=media')) return new Response(files.get('f1'));
    if (url.includes('/upload/drive/v3/files/f1') && method === 'PATCH') { files.set('f1', init!.body as string); return new Response('{}'); }
    if (url.includes('/upload/drive/v3/files?uploadType=multipart')) {
      const body = init!.body as string;
      expect(body).toContain('"parents":["appDataFolder"]');
      expect(body).toContain(FILE_NAME);
      files.set('f1', body.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]);
      return new Response(JSON.stringify({ id: 'f1' }));
    }
    return new Response('{}', { status: 404 });
  };
  return { fetchFn, files, calls, fail: (v: number | 'offline' | null) => { failWith = v; }, doc: () => JSON.parse(files.get('f1') ?? 'null') as SyncDoc | null };
}

function localWith(save: ArtSave): LocalStore & { cur: () => ArtSave } {
  let cur = save;
  return { get: () => cur, update: (fn) => { cur = fn(cur); }, cur: () => cur };
}
const save = (over: Partial<ArtSave> = {}): ArtSave => ({ ...defaultArtSave(), deviceId: 'devA', counters: { devA: 3 }, completed: 3, ...over });
const rec = { bestTimeMs: 50_000, bestMoves: 80, lastClearedAt: 1000, clears: { devA: 3 } };
const withRecords = (): ArtSave => save({ bests: { '3': { timeMs: 50_000, moves: 80 } }, records: { 'monet-water-lilies:3': rec } });

describe('sync round', () => {
  it('first sync migrates the device records to Drive and changes nothing locally', async () => {
    const d = fakeDrive();
    const local = localWith(withRecords());
    const out = await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local });
    expect(out).toEqual({ status: 'ok', uploaded: true });
    expect(d.doc()!.counters).toEqual({ devA: 3 });
    expect(d.doc()!.records['monet-water-lilies:3']).toEqual(rec);
    expect(local.cur().bests['3']).toEqual({ timeMs: 50_000, moves: 80 });
    expect(local.cur().completed).toBe(3);
  });

  it('a second device receives the records and uploads its own; both end up identical', async () => {
    const d = fakeDrive();
    const a = localWith(withRecords());
    await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local: a });
    const b = localWith(save({ deviceId: 'devB', counters: { devB: 2 }, completed: 2, bests: { '3': { timeMs: 40_000, moves: 95 } }, records: { 'van-gogh-bedroom:3': { bestTimeMs: 40_000, bestMoves: 95, clears: { devB: 2 } } } }));
    expect((await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local: b })).status).toBe('ok');
    expect(b.cur().completed).toBe(5);
    expect(b.cur().bests['3']).toEqual({ timeMs: 40_000, moves: 80 });
    expect(Object.keys(b.cur().records).sort()).toEqual(['monet-water-lilies:3', 'van-gogh-bedroom:3']);
    await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local: a });
    expect(a.cur().completed).toBe(5);
    expect(toDoc(a.cur()).records).toEqual(toDoc(b.cur()).records);
  });

  it('syncing again with nothing new uploads nothing and counts nothing twice', async () => {
    const d = fakeDrive();
    const local = localWith(withRecords());
    await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local });
    const writes = () => d.calls.filter((c) => c.startsWith('PATCH') || c.startsWith('POST')).length;
    const before = writes();
    expect(await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local })).toEqual({ status: 'ok', uploaded: false });
    expect(writes()).toBe(before);
    expect(local.cur().completed).toBe(3);
  });

  it('a failed upload loses nothing: the device keeps everything and the next round uploads it', async () => {
    const d = fakeDrive(emptyDoc());
    const local = localWith(withRecords());
    d.fail(500);
    expect((await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local })).status).toBe('error');
    expect(local.cur().records['monet-water-lilies:3']).toEqual(rec);
    expect(local.cur().completed).toBe(3);
    d.fail(null);
    expect(await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local })).toEqual({ status: 'ok', uploaded: true });
    expect(d.doc()!.counters).toEqual({ devA: 3 });
  });

  it('offline is a retryable error, an expired token asks for a reconnect, neither touches the records', async () => {
    const d = fakeDrive();
    const local = localWith(withRecords());
    d.fail('offline');
    expect(await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local })).toEqual({ status: 'error', retryable: true });
    d.fail(401);
    expect((await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local })).status).toBe('needs-consent');
    d.fail(null);
    expect((await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => null, local })).status).toBe('needs-consent');
    expect(local.cur().completed).toBe(3);
    expect(DriveAuthError).toBeDefined();
  });

  it('never overwrites a file written by a newer app version or by something else', async () => {
    const d = fakeDrive({ schema: 99, counters: { x: 1 } });
    const local = localWith(withRecords());
    expect((await syncOnce({ drive: driveClient(d.fetchFn), getToken: async () => 't', local })).status).toBe('newer-version');
    expect(JSON.parse(d.files.get('f1')!).schema).toBe(99);
    expect(d.calls.some((c) => c.startsWith('PATCH') || c.startsWith('POST'))).toBe(false);
  });

  it('plays made on the device while a sync is running are not lost', async () => {
    const d = fakeDrive(emptyDoc());
    const local = localWith(withRecords());
    const slowFetch: FetchFn = async (url, init) => {
      const r = await d.fetchFn(url, init);
      if (url.includes('alt=media')) local.update((s) => ({ ...s, counters: { ...s.counters, devA: 4 }, completed: 4 })); // a clear happens meanwhile
      return r;
    };
    await syncOnce({ drive: driveClient(slowFetch), getToken: async () => 't', local });
    expect(local.cur().completed).toBe(4);
    expect(d.doc()!.counters).toEqual({ devA: 4 });
  });
});

describe('device records <-> document', () => {
  it('applying a document only adds or improves', () => {
    const s = withRecords();
    const remote: SyncDoc = { ...emptyDoc(), counters: { devB: 9 }, bests: { '3': { timeMs: 99_000, moves: 10 } } };
    const r = applyDoc(s, remote);
    expect(r.bests['3']).toEqual({ timeMs: 50_000, moves: 10 }); // not worse in either
    expect(r.completed).toBe(12);
    expect(r.records['monet-water-lilies:3']).toEqual(rec);
    expect(r.inProgress).toBe(s.inProgress); // settings and puzzles in progress are untouched
    expect(r.showNumbers).toBe(s.showNumbers);
  });
});
