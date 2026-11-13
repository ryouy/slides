import { useEffect } from 'react';

/** Calls onTick(ms) about 4 times a second with real elapsed time; pauses while the tab is hidden. */
export function useGameTimer(onTick: (ms: number) => void) {
  useEffect(() => {
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (!document.hidden) onTick(Math.min(now - last, 1000));
      last = now;
    }, 250);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
