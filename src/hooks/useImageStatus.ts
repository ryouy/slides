import { useEffect, useState } from 'react';

export type ImageStatus = 'loading' | 'ready' | 'error';

/** Preloads an image and reports whether it loaded; `retry` tries again after a failure. */
export function useImageStatus(url: string) {
  const [status, setStatus] = useState<ImageStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    const img = new Image();
    img.onload = () => alive && setStatus('ready');
    img.onerror = () => alive && setStatus('error');
    img.src = attempt ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url;
    return () => {
      alive = false;
    };
  }, [url, attempt]);
  return { status, retry: () => setAttempt((a) => a + 1) };
}
