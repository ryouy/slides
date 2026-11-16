/**
 * "My Photos": the visitor's own pictures as puzzles (Premium).
 *
 * Everything happens in the browser: a photo is read, checked, shrunk and kept in this device's IndexedDB. It is never
 * uploaded, never synced (not even to Google Drive) and never shared. Limits keep the device's storage in check.
 */
export const MAX_PHOTOS = 20;
/** Total stored size (after shrinking) the photos may use. */
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
/** Largest picture file accepted for adding. */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_SIDE = 1600;
export const THUMB_SIDE = 480;

export type PhotoErrorCode = 'type' | 'size' | 'limit' | 'quota' | 'decode' | 'storage';
export class PhotoError extends Error {
  constructor(public code: PhotoErrorCode) {
    super(code);
  }
}

export interface PhotoMeta {
  id: string;
  name: string;
  createdAt: number;
  width: number;
  height: number;
  bytes: number;
}
export interface PhotoRecord extends PhotoMeta {
  blob: Blob;
  thumb: Blob;
}

// ---- pure helpers (unit-tested) ----

/** JPEG, PNG or WebP by the file's own bytes (the extension and the declared type are not trusted). */
export function detectImageType(b: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'webp';
  return null;
}

/** Scales (w, h) down so the longer side is at most `max` (never up). */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Can another photo of about `extraBytes` be added? Returns the reason it cannot, or null. */
export function limitProblem(existing: readonly PhotoMeta[], extraBytes: number): 'limit' | 'quota' | null {
  if (existing.length >= MAX_PHOTOS) return 'limit';
  if (existing.reduce((s, p) => s + p.bytes, 0) + extraBytes > MAX_TOTAL_BYTES) return 'quota';
  return null;
}

export const photoArtworkId = (id: string): string => `custom:${id}`;
export const photoIdOf = (artworkId: string): string => artworkId.slice('custom:'.length);

// ---- IndexedDB ----
const DB_NAME = 'slides-photos';
const STORE = 'photos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new PhotoError('storage'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new PhotoError('storage'));
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(r.result);
        };
        t.onerror = t.onabort = () => {
          db.close();
          reject(new PhotoError(t.error?.name === 'QuotaExceededError' ? 'quota' : 'storage'));
        };
      }),
  );
}

export async function listPhotos(): Promise<PhotoMeta[]> {
  const all = await tx<PhotoRecord[]>('readonly', (s) => s.getAll());
  return all
    .map(({ id, name, createdAt, width, height, bytes }) => ({ id, name, createdAt, width, height, bytes }))
    .sort((a, b) => b.createdAt - a.createdAt);
}
export const getAllPhotos = () => tx<PhotoRecord[]>('readonly', (s) => s.getAll());
export const getPhoto = (id: string) => tx<PhotoRecord | undefined>('readonly', (s) => s.get(id));
export const deletePhoto = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);

async function drawScaled(bitmap: ImageBitmap, max: number, type: string, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('decode');
  ctx.drawImage(bitmap, 0, 0, width, height); // re-drawing drops all metadata (location, camera...)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
  if (!blob) throw new PhotoError('decode');
  return { blob, width, height };
}

/** Reads, checks and shrinks one picture file and stores it. Throws PhotoError. */
export async function addPhoto(file: File): Promise<PhotoMeta> {
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError('size');
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!detectImageType(head)) throw new PhotoError('type');
  const existing = await listPhotos();
  const early = limitProblem(existing, 0);
  if (early) throw new PhotoError(early);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); // honours the camera's rotation
  } catch {
    try {
      bitmap = await createImageBitmap(file); // older browsers without the option (they apply the rotation themselves)
    } catch {
      throw new PhotoError('decode');
    }
  }
  try {
    const main = await drawScaled(bitmap, MAX_SIDE, 'image/webp', 0.86);
    const thumb = await drawScaled(bitmap, THUMB_SIDE, 'image/webp', 0.8);
    const problem = limitProblem(existing, main.blob.size + thumb.blob.size);
    if (problem) throw new PhotoError(problem);
    const meta: PhotoMeta = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Photo',
      createdAt: Date.now(),
      width: main.width,
      height: main.height,
      bytes: main.blob.size + thumb.blob.size,
    };
    await tx('readwrite', (s) => s.add({ ...meta, blob: main.blob, thumb: thumb.blob } satisfies PhotoRecord));
    return meta;
  } finally {
    bitmap.close();
  }
}
