import { useCallback, useMemo } from 'react';
import { scheduleSync } from '../../sync/state';
import { useArtSave } from './storage';

/**
 * The paintings the visitor starred. They live in the ART SLIDE save (`favorites`) and ride along with Google Drive sync, so the
 * same stars show on the web and in the iOS app. Custom photos are not starred.
 */

/** The starred painting ids; the component re-renders when they change. */
export function useFavorites(): readonly string[] {
  const { data } = useArtSave();
  return useMemo(() => Object.entries(data.favorites).filter(([, f]) => f.on).map(([id]) => id), [data.favorites]);
}

/** Stars or un-stars a painting (the time of the change is kept, so the latest change wins across devices). */
export function useToggleFavorite(): (id: string) => void {
  const { update } = useArtSave();
  return useCallback((id: string) => {
    update((d) => ({ ...d, favorites: { ...d.favorites, [id]: { on: !d.favorites[id]?.on, at: Date.now() } } }));
    scheduleSync(2500);
  }, [update]);
}
