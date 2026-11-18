import { StripeError } from './stripe';

/** Anything that looks like a credential is replaced before a line reaches the logs (defence in depth: errors should not carry them at all). */
const SECRET = /\b(?:(?:sk|rk|pk)_(?:live|test)_|whsec_|(?:ghp|gho|ghu|ghs|ghr)_|GOCSPX-)[A-Za-z0-9_*.-]*|Bearer\s+[A-Za-z0-9._~+/=*-]+/g;
export const redact = (s: string): string => s.replace(SECRET, '[redacted]');

/**
 * What may be logged about a failure: for Stripe only the HTTP status, its class and Stripe's short codes; for anything else the
 * error's name and a short redacted message. Never a response body, a stack, or the error object itself.
 */
export function describeError(e: unknown): string {
  if (e instanceof StripeError) return `StripeError status=${e.status} class=${e.kind}${e.type ? ` type=${e.type}` : ''}${e.code ? ` code=${e.code}` : ''}`;
  if (e instanceof Error) return `${e.name}: ${redact(e.message).slice(0, 200)}`;
  return `non-error value thrown (${typeof e})`;
}

export const logError = (label: string, e?: unknown): void => console.error(e === undefined ? label : `${label}: ${describeError(e)}`);
