import { logError } from './safeLog';
import { fullImageId } from './artwork';
import { err, json } from './http';
import type { D1Database, Env } from './env';

/**
 * Apple (App Store) purchases for the iOS app. Everything here is verified on the server:
 *  - a signed transaction (JWS) must carry Apple's certificate chain ending in the pinned Apple Root CA - G3,
 *  - its bundle id / product id must be ours, it must not be expired or revoked.
 * The iOS app only ever sends the signed transaction StoreKit gave it; a plain "I am Premium" flag is never accepted.
 * Off until APPLE_BUNDLE_ID and APPLE_PRODUCT_ID are set (the endpoints then answer 503) — the website is not affected.
 */

/** SHA-256 of "Apple Root CA - G3" (https://www.apple.com/certificateauthority/). */
export const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

// ---- tiny DER reader (just enough for X.509) ----
interface Node { tag: number; start: number; hdr: number; len: number; end: number }
function read(buf: Uint8Array, pos: number): Node {
  const tag = buf[pos];
  let len = buf[pos + 1], hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error('der');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos + 2 + i];
    hdr = 2 + n;
  }
  const end = pos + hdr + len;
  if (end > buf.length) throw new Error('der');
  return { tag, start: pos, hdr, len, end };
}
const children = (buf: Uint8Array, n: Node): Node[] => {
  const out: Node[] = [];
  for (let p = n.start + n.hdr; p < n.end; ) { const c = read(buf, p); out.push(c); p = c.end; }
  return out;
};
const slice = (buf: Uint8Array, n: Node) => buf.subarray(n.start, n.end);
const body = (buf: Uint8Array, n: Node) => buf.subarray(n.start + n.hdr, n.end);
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

interface Cert { der: Uint8Array; tbs: Uint8Array; sigAlg: string; sig: Uint8Array; spki: Uint8Array; notBefore: number; notAfter: number }
const OID_ECDSA_SHA256 = '2a8648ce3d040302', OID_ECDSA_SHA384 = '2a8648ce3d040303';
function parseTime(buf: Uint8Array, n: Node): number {
  const s = new TextDecoder().decode(body(buf, n));
  const m = n.tag === 0x17 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/.exec(s) : /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/.exec(s);
  if (!m) throw new Error('time');
  const y = n.tag === 0x17 ? (Number(m[1]) >= 50 ? 1900 : 2000) + Number(m[1]) : Number(m[1]);
  return Date.UTC(y, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}
function parseCert(der: Uint8Array): Cert {
  const top = read(der, 0);
  const [tbs, alg, sigBits] = children(der, top);
  const tbsKids = children(der, tbs);
  const i = tbsKids[0].tag === 0xa0 ? 1 : 0; // optional [0] version
  const validity = children(der, tbsKids[i + 3]);
  return {
    der, tbs: slice(der, tbs),
    sigAlg: hex(body(der, children(der, alg)[0])),
    sig: body(der, sigBits).subarray(1), // drop the "unused bits" byte
    spki: slice(der, tbsKids[i + 5]),
    notBefore: parseTime(der, validity[0]), notAfter: parseTime(der, validity[1]),
  };
}
/** DER ECDSA signature -> the raw r||s that WebCrypto wants. */
function derSigToRaw(der: Uint8Array, size: number): Uint8Array {
  const [r, s] = children(der, read(der, 0));
  const fix = (n: Node) => {
    let v = body(der, n);
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const out = new Uint8Array(size * 2);
  out.set(fix(r), 0);
  out.set(fix(s), size);
  return out;
}
const curveOf = (spki: Uint8Array): { name: 'P-256' | 'P-384'; size: number } => (spki.length > 100 ? { name: 'P-384', size: 48 } : { name: 'P-256', size: 32 });
async function verifyCertSig(child: Cert, parent: Cert): Promise<boolean> {
  const hash = child.sigAlg === OID_ECDSA_SHA384 ? 'SHA-384' : child.sigAlg === OID_ECDSA_SHA256 ? 'SHA-256' : null;
  if (!hash) return false;
  const c = curveOf(parent.spki);
  const key = await crypto.subtle.importKey('spki', parent.spki as BufferSource, { name: 'ECDSA', namedCurve: c.name }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash }, key, derSigToRaw(child.sig, c.size) as BufferSource, child.tbs as BufferSource);
}
const contains = (hay: Uint8Array, needle: number[]): boolean => {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return true; }
  return false;
};
// Apple's marker extensions: 1.2.840.113635.100.6.11.1 (leaf, "Mac App Store receipt signing"), 1.2.840.113635.100.6.2.1 (intermediate)
const OID_LEAF = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01];
const OID_INTERMEDIATE = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01];

const b64 = (s: string): Uint8Array => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
const b64std = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Verifies an Apple-signed JWS (chain to the pinned root + signature) and returns its payload, or null. */
export async function verifyAppleJws(jws: string, opts: { rootSha256?: string; now?: number; requireOids?: boolean } = {}): Promise<Record<string, unknown> | null> {
  try {
    const parts = jws.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(b64(parts[0]))) as { alg?: string; x5c?: string[] };
    if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) return null;
    const [leaf, inter, root] = header.x5c.map((c) => parseCert(b64std(c)));
    const rootHash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', root.der as BufferSource)));
    if (rootHash !== (opts.rootSha256 ?? APPLE_ROOT_G3_SHA256)) return null;
    const now = opts.now ?? Date.now();
    for (const c of [leaf, inter, root]) if (now < c.notBefore || now > c.notAfter) return null;
    if (opts.requireOids !== false && !(contains(leaf.der, OID_LEAF) && contains(inter.der, OID_INTERMEDIATE))) return null;
    if (!(await verifyCertSig(leaf, inter)) || !(await verifyCertSig(inter, root)) || !(await verifyCertSig(root, root))) return null;
    const key = await crypto.subtle.importKey('spki', leaf.spki as BufferSource, { name: 'ECDSA', namedCurve: curveOf(leaf.spki).name }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64(parts[2]) as BufferSource, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return ok ? (JSON.parse(new TextDecoder().decode(b64(parts[1]))) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const appleConfigured = (e: Env): boolean => !!(e.APPLE_BUNDLE_ID && e.APPLE_PRODUCT_ID);

export interface AppleTx { originalTransactionId: string; expiresMs: number; revoked: boolean }
/** A verified transaction of OUR app and product that is not expired or revoked (checked against the clock and the notifications table). */
export async function activeAppleTransaction(jws: string, env: Env, now = Date.now(), rootSha256?: string): Promise<AppleTx | null> {
  const p = await verifyAppleJws(jws, { rootSha256, now, requireOids: rootSha256 === undefined });
  if (!p) return null;
  if (p.bundleId !== env.APPLE_BUNDLE_ID || p.productId !== env.APPLE_PRODUCT_ID) return null;
  if (p.environment === 'Sandbox' && env.APPLE_ALLOW_SANDBOX !== 'true') return null; // test purchases never unlock the real service
  const expires = Number(p.expiresDate ?? 0);
  if (!expires || expires <= now || p.revocationDate) return null;
  const original = String(p.originalTransactionId ?? '');
  if (!original) return null;
  if (env.DB) {
    const row = await env.DB.prepare('SELECT expires_ms, revoked FROM apple_subs WHERE original_transaction_id = ?').bind(original).first<{ expires_ms: number; revoked: number }>();
    if (row && (row.revoked === 1 || row.expires_ms <= now)) return null; // a refund / expiry told us by Apple's notifications
  }
  return { originalTransactionId: original, expiresMs: expires, revoked: false };
}

const CREATE = 'CREATE TABLE IF NOT EXISTS apple_subs (original_transaction_id TEXT PRIMARY KEY, expires_ms INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, last_type TEXT, updated_at INTEGER NOT NULL)';
let ensured = false;
async function ensureTable(db: D1Database) { if (!ensured) { await db.prepare(CREATE).run(); ensured = true; } }

const REVOKING = new Set(['REFUND', 'REVOKE']);
/** App Store Server Notifications V2: updates renewals, expiry, refunds and revocations. Authenticated by Apple's signature, not by a session. */
export async function handleAppleNotification(request: Request, env: Env, rootSha256?: string): Promise<Response> {
  if (!appleConfigured(env) || !env.DB) return err(503, 'not_configured');
  const body = (await request.json().catch(() => null)) as { signedPayload?: unknown } | null;
  if (typeof body?.signedPayload !== 'string') return err(400, 'bad_request');
  const opts = { rootSha256, requireOids: rootSha256 === undefined };
  const n = await verifyAppleJws(body.signedPayload, opts);
  if (!n) return err(401, 'bad_signature');
  const data = (n.data ?? {}) as { bundleId?: string; signedTransactionInfo?: string };
  if (data.bundleId !== env.APPLE_BUNDLE_ID) return json({ ok: true, ignored: true }); // not ours
  const tx = data.signedTransactionInfo ? await verifyAppleJws(data.signedTransactionInfo, opts) : null;
  if (!tx || tx.productId !== env.APPLE_PRODUCT_ID || !tx.originalTransactionId) return json({ ok: true, ignored: true });
  const type = String(n.notificationType ?? '');
  const revoked = REVOKING.has(type) || !!tx.revocationDate ? 1 : 0;
  await ensureTable(env.DB);
  await env.DB.prepare(
    'INSERT INTO apple_subs (original_transaction_id, expires_ms, revoked, last_type, updated_at) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(original_transaction_id) DO UPDATE SET expires_ms = excluded.expires_ms, revoked = excluded.revoked, last_type = excluded.last_type, updated_at = excluded.updated_at',
  ).bind(String(tx.originalTransactionId), Number(tx.expiresDate ?? 0), revoked, type, Date.now()).run();
  // The notification is also authoritative for a transaction that was explicitly
  // attached to a shared account.  Do not create an entitlement here: an Apple
  // notification alone is not proof of which ART SLIDE account owns it.
  await env.DB.prepare('UPDATE apple_entitlements SET expires_ms = ?, revoked = ?, updated_at = ? WHERE original_transaction_id = ?')
    .bind(Number(tx.expiresDate ?? 0), revoked, Date.now(), String(tx.originalTransactionId)).run().catch(() => undefined);
  return json({ ok: true });
}

/** GET /api/apple/artwork/<id>.  Authorization: Bearer <signed transaction>.  Premium paintings for the iOS app. */
export async function serveAppleArtwork(request: Request, env: Env, rootSha256?: string): Promise<Response> {
  if (!appleConfigured(env)) return err(503, 'not_configured');
  if (request.method !== 'GET') return err(405, 'method');
  const m = /^\/api\/apple\/artwork\/([A-Za-z0-9_-]+)$/.exec(new URL(request.url).pathname);
  if (!m || m[1].endsWith('-thumb')) return err(404, 'not_found');
  const auth = request.headers.get('authorization') ?? '';
  const jws = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  try {
    if (env.DB) await ensureTable(env.DB);
    if (!jws || !(await activeAppleTransaction(jws, env, Date.now(), rootSha256))) return err(403, 'premium_required');
  } catch (e) {
    logError('apple artwork check failed', e);
    return err(503, 'unavailable'); // fail closed
  }
  const res = await env.ASSETS.fetch(new Request(new URL(`/artworks/${m[1]}.webp`, request.url)));
  if (!res.ok || fullImageId(`/artworks/${m[1]}.webp`) === null) return err(404, 'not_found');
  const h = new Headers(res.headers);
  h.set('cache-control', 'private, no-store');
  return new Response(res.body, { status: 200, headers: h });
}
