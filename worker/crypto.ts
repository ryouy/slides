const enc = new TextEncoder();

export const toHex = (buf: ArrayBuffer | Uint8Array): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const randomToken = (bytes = 32): string => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
export const randomId = (): string => crypto.randomUUID();

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
export async function sha256B64url(text: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
export async function hmacHex(secret: string, data: string): Promise<string> {
  return toHex(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** `payload.signature`: tamper-proof short-lived values kept in a cookie (the OAuth login state). */
export async function signValue(secret: string, value: unknown): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(value)));
  return `${payload}.${await hmacHex(secret, payload)}`;
}
export async function verifyValue<T>(secret: string, signed: string | undefined): Promise<T | null> {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const payload = signed.slice(0, i);
  if (!safeEqual(signed.slice(i + 1), await hmacHex(secret, payload))) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as T;
  } catch {
    return null;
  }
}
