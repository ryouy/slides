import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { activeAppleTransaction, APPLE_ROOT_G3_SHA256, handleAppleNotification, serveAppleArtwork, verifyAppleJws } from './apple';
import type { Env } from './env';

// A private test chain made with openssl (root P-384 -> intermediate P-384 -> leaf P-256), shaped like Apple's. The pinned Apple root is NOT used here.
let leafKeyPem = '', x5c: string[] = [], rootSha = '';
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function jwsOf(payload: object, opts: { key?: string; chain?: string[]; alg?: string } = {}): string {
  const h = b64u(JSON.stringify({ alg: opts.alg ?? 'ES256', x5c: opts.chain ?? x5c }));
  const p = b64u(JSON.stringify(payload));
  const sig = sign('sha256', Buffer.from(`${h}.${p}`), { key: createPrivateKey(opts.key ?? leafKeyPem), dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${b64u(sig)}`;
}
beforeAll(() => {
  const d = mkdtempSync(join(tmpdir(), 'applechain-'));
  const sh = (...a: string[]) => execFileSync('openssl', a, { cwd: d, stdio: 'pipe' });
  const ext = (n: string, ca: boolean) => writeFileSync(join(d, n), `basicConstraints=${ca ? 'CA:TRUE' : 'CA:FALSE'}\n`);
  ext('ca.ext', true); ext('leaf.ext', false);
  sh('ecparam', '-name', 'secp384r1', '-genkey', '-noout', '-out', 'root.key');
  sh('req', '-new', '-x509', '-key', 'root.key', '-sha384', '-days', '3650', '-subj', '/CN=Test Root', '-out', 'root.pem', '-addext', 'basicConstraints=critical,CA:TRUE');
  sh('ecparam', '-name', 'secp384r1', '-genkey', '-noout', '-out', 'int.key');
  sh('req', '-new', '-key', 'int.key', '-subj', '/CN=Test Intermediate', '-out', 'int.csr');
  sh('x509', '-req', '-in', 'int.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-sha384', '-days', '3650', '-extfile', 'ca.ext', '-out', 'int.pem');
  sh('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'leaf.key');
  sh('req', '-new', '-key', 'leaf.key', '-subj', '/CN=Test Leaf', '-out', 'leaf.csr');
  sh('x509', '-req', '-in', 'leaf.csr', '-CA', 'int.pem', '-CAkey', 'int.key', '-CAcreateserial', '-sha384', '-days', '3650', '-extfile', 'leaf.ext', '-out', 'leaf.pem');
  const der = (f: string) => { sh('x509', '-in', f, '-outform', 'der', '-out', `${f}.der`); return readFileSync(join(d, `${f}.der`)); };
  const ders = ['leaf.pem', 'int.pem', 'root.pem'].map(der);
  x5c = ders.map((b) => b.toString('base64'));
  rootSha = createHash('sha256').update(ders[2]).digest('hex');
  sh('pkcs8', '-topk8', '-nocrypt', '-in', 'leaf.key', '-out', 'leaf.p8');
  leafKeyPem = readFileSync(join(d, 'leaf.p8'), 'utf8');
});

const env = (extra: Partial<Env> = {}): Env => ({ ASSETS: { fetch: async () => new Response('IMG', { status: 200, headers: { 'content-type': 'image/webp' } }) }, APPLE_BUNDLE_ID: 'com.test.app', APPLE_PRODUCT_ID: 'prem.monthly', ...extra }) as Env;
const tx = (o: Record<string, unknown> = {}) => ({ bundleId: 'com.test.app', productId: 'prem.monthly', originalTransactionId: '1000', expiresDate: Date.now() + 86400000, environment: 'Production', ...o });
const opts = () => ({ rootSha256: rootSha, requireOids: false });

describe('Apple signed transactions', () => {
  it('pins the real Apple Root CA G3', () => expect(APPLE_ROOT_G3_SHA256).toHaveLength(64));
  it('accepts a correctly signed chain', async () => expect((await verifyAppleJws(jwsOf(tx()), opts()))?.productId).toBe('prem.monthly'));
  it('rejects a chain whose root is not the pinned one (the real Apple pin rejects a private chain)', async () => expect(await verifyAppleJws(jwsOf(tx()))).toBeNull());
  it('rejects a tampered payload', async () => {
    const [h, , s] = jwsOf(tx()).split('.');
    expect(await verifyAppleJws(`${h}.${b64u(JSON.stringify(tx({ expiresDate: 9e15 })))}.${s}`, opts())).toBeNull();
  });
  it('rejects a signature made with another key', async () => {
    const other = execFileSync('openssl', ['genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256']).toString();
    expect(await verifyAppleJws(jwsOf(tx(), { key: other }), opts())).toBeNull();
  });
  it('rejects missing/short chains and wrong alg', async () => {
    expect(await verifyAppleJws(jwsOf(tx(), { chain: x5c.slice(0, 2) }), opts())).toBeNull();
    expect(await verifyAppleJws(jwsOf(tx(), { alg: 'none' }), opts())).toBeNull();
    expect(await verifyAppleJws('a.b', opts())).toBeNull();
  });
  it('rejects a certificate chain that is out of its validity dates', async () => {
    expect(await verifyAppleJws(jwsOf(tx()), { ...opts(), now: Date.now() + 20 * 365 * 86400000 })).toBeNull();
  });
});

describe('active transaction rules', () => {
  const ok = (p: object, e = env()) => activeAppleTransaction(jwsOf(p), e, Date.now(), rootSha);
  it('accepts ours, unexpired', async () => expect(await ok(tx())).not.toBeNull());
  it('rejects another app / product', async () => {
    expect(await ok(tx({ bundleId: 'com.other' }))).toBeNull();
    expect(await ok(tx({ productId: 'other' }))).toBeNull();
  });
  it('rejects expired and revoked', async () => {
    expect(await ok(tx({ expiresDate: Date.now() - 1000 }))).toBeNull();
    expect(await ok(tx({ revocationDate: Date.now() - 1000 }))).toBeNull();
  });
  it('rejects Sandbox unless explicitly allowed', async () => {
    expect(await ok(tx({ environment: 'Sandbox' }))).toBeNull();
    expect(await ok(tx({ environment: 'Sandbox' }), env({ APPLE_ALLOW_SANDBOX: 'true' }))).not.toBeNull();
  });
});

describe('Premium painting download endpoint', () => {
  const req = (auth?: string, path = '/api/apple/artwork/monet-water-lilies') => new Request(`https://x.test${path}`, { headers: auth ? { authorization: auth } : {} });
  it('is off (503) until the app ids are configured', async () => expect((await serveAppleArtwork(req(), env({ APPLE_BUNDLE_ID: undefined }), rootSha)).status).toBe(503));
  it('403 without a transaction', async () => expect((await serveAppleArtwork(req(), env(), rootSha)).status).toBe(403));
  it('403 with a forged transaction', async () => expect((await serveAppleArtwork(req('Bearer a.b.c'), env(), rootSha)).status).toBe(403));
  it('serves the image for a valid transaction, never cached', async () => {
    const r = await serveAppleArtwork(req(`Bearer ${jwsOf(tx())}`), env(), rootSha);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('no-store');
  });
  it('does not serve thumbnails or odd paths', async () => {
    expect((await serveAppleArtwork(req(`Bearer ${jwsOf(tx())}`, '/api/apple/artwork/x-thumb'), env(), rootSha)).status).toBe(404);
    expect((await serveAppleArtwork(req(`Bearer ${jwsOf(tx())}`, '/api/apple/artwork/..%2Fsecret'), env(), rootSha)).status).toBe(404);
  });
});

describe('App Store notifications', () => {
  it('rejects an unsigned/forged notification and writes nothing', async () => {
    let wrote = false;
    const db = { prepare: () => ({ bind: () => ({ run: async () => { wrote = true; return { success: true }; }, first: async () => null, all: async () => ({ success: true }) }), run: async () => ({ success: true }) }), batch: async () => [] };
    const r = await handleAppleNotification(new Request('https://x.test/n', { method: 'POST', body: JSON.stringify({ signedPayload: 'a.b.c' }) }), env({ DB: db as never }), rootSha);
    expect(r.status).toBe(401);
    expect(wrote).toBe(false);
  });
  it('records a refund as revoked', async () => {
    const binds: unknown[][] = [];
    const db = { prepare: () => ({ bind: (...a: unknown[]) => { binds.push(a); return { run: async () => ({ success: true }), first: async () => null }; }, run: async () => ({ success: true }) }), batch: async () => [] };
    const signedTransactionInfo = jwsOf(tx());
    const signedPayload = jwsOf({ notificationType: 'REFUND', data: { bundleId: 'com.test.app', signedTransactionInfo } });
    const r = await handleAppleNotification(new Request('https://x.test/n', { method: 'POST', body: JSON.stringify({ signedPayload }) }), env({ DB: db as never }), rootSha);
    expect(r.status).toBe(200);
    expect(binds.some((b) => b[0] === '1000' && b[2] === 1 && b[3] === 'REFUND')).toBe(true);
  });
});
