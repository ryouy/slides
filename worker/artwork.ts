import { logError } from './safeLog';
import { dailyArtworkId } from '../src/games/art-slide/logic/dailyPick';
import { isFreeArtwork } from '../src/premium/freeList';
import { jstDateKey } from '../src/utils/date';
import { currentUser } from './auth';
import { authConfigured, stripeLivemode, type Env } from './env';
import { getSubscription, nowSec } from './db';
import { hasPremium } from './entitlement';

/**
 * Full-size paintings are served through the Worker so that Premium paintings need a Premium account.
 * Thumbnails (…-thumb.webp) never come here (see run_worker_first in wrangler.jsonc): the gallery stays plain static files.
 *
 * Off by default: until PREMIUM_ENFORCED is "true" (set together with VITE_PREMIUM_ENABLED when Premium goes live),
 * every image is passed straight through, exactly like before.
 */
const FULL_IMAGE = /^\/artworks\/([A-Za-z0-9_-]+)\.webp$/;

/** The painting id of a full-size image path, or null (thumbnails, other files). */
export function fullImageId(pathname: string): string | null {
  const m = FULL_IMAGE.exec(pathname);
  return m && !m[1].endsWith('-thumb') ? m[1] : null;
}

/** Today's daily painting is open to everybody (also yesterday's/tomorrow's, so time zones never lock a player out). */
export function isDailyImage(id: string, now = Date.now()): boolean {
  return [-1, 0, 1].some((d) => dailyArtworkId(jstDateKey(now + d * 86_400_000)) === id);
}

export async function serveArtwork(request: Request, env: Env): Promise<Response> {
  const id = fullImageId(new URL(request.url).pathname);
  if (!id || env.PREMIUM_ENFORCED !== 'true' || isFreeArtwork(id) || isDailyImage(id)) return env.ASSETS.fetch(request);

  // a Premium painting: only for an account whose contract (as recorded in D1) is active
  let premium = false;
  try {
    if (authConfigured(env)) {
      const user = await currentUser(request, env);
      if (user) premium = hasPremium(await getSubscription(env.DB!, user.id, stripeLivemode(env)), nowSec());
    }
  } catch (e) {
    logError('artwork check failed', e); // fail closed: never hand out a Premium image on an error
    return new Response('Unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  if (!premium) return new Response('Premium paintings need a Premium account', { status: 403, headers: { 'cache-control': 'no-store' } });
  const res = await env.ASSETS.fetch(request);
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'private, no-store'); // never kept by shared caches or reused for someone else
  return new Response(res.body, { status: res.status, headers });
}
