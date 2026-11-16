import { useCallback, useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/Icons';
import { Link } from '../components/Link';
import { useArtSave } from '../games/art-slide/storage';
import { useT, type Key } from '../i18n';
import { PremiumPanel } from '../premium/PremiumPage';
import { useEntitlement } from '../premium/entitlement';
import { go } from '../router';
import { formatTime } from '../storage/stats';
import { listPhotoCards, removePhoto, revokeThumbs } from './loader';
import { addPhoto, MAX_PHOTOS, MAX_TOTAL_BYTES, PhotoError, photoArtworkId, type PhotoMeta } from './photos';

type Card = { meta: PhotoMeta; thumbUrl: string };
const ERR: Record<string, Key> = { type: 'photos.errType', size: 'photos.errSize', limit: 'photos.errLimit', quota: 'photos.errQuota', decode: 'photos.errDecode', storage: 'photos.errStorage' };

/** My Photos: the visitor's own pictures as puzzles (Premium). Everything stays in this browser. */
export function PhotosPage() {
  const t = useT();
  const { premium, gating } = useEntitlement();
  const { data } = useArtSave();
  const locked = gating && !premium;
  const [cards, setCards] = useState<Card[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const live = useRef<Card[]>([]);

  const reload = useCallback(async () => {
    try {
      const next = await listPhotoCards();
      revokeThumbs(live.current);
      live.current = next;
      setCards(next);
    } catch {
      setCards([]);
      setErrors([t('photos.errStorage')]);
    }
  }, [t]);
  useEffect(() => {
    void reload();
    return () => revokeThumbs(live.current);
  }, [reload]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || locked) return;
    setBusy(true);
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      try {
        await addPhoto(file);
      } catch (e) {
        const code = e instanceof PhotoError ? e.code : 'decode';
        problems.push(`${file.name}: ${t(ERR[code], { max: MAX_PHOTOS })}`);
      }
    }
    setErrors(problems);
    await reload();
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  const del = async (c: Card) => {
    if (!window.confirm(t('photos.deleteConfirm'))) return;
    await removePhoto(c.meta.id);
    await reload();
  };

  const best = (id: string): number | undefined => {
    const times = Object.entries(data.customRecords).filter(([k]) => k.startsWith(`${photoArtworkId(id)}:`)).map(([, r]) => r.bestTimeMs).filter((x): x is number => x !== undefined);
    return times.length ? Math.min(...times) : undefined;
  };
  const used = (cards ?? []).reduce((s, c) => s + c.meta.bytes, 0);

  return (
    <div className="screen photos-screen" data-testid="photos">
      <header className="topbar">
        <BackButton onClick={() => go('')} label={t('common.back')} />
        <h1>{t('photos.title')}</h1>
        <div className="top-right" />
      </header>

      {locked && <PremiumPanel reason="photos" />}

      {!locked && (
        <div className="photos-add">
          <input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple data-testid="photo-input" aria-label={t('photos.add')} onChange={(e) => void onFiles(e.target.files)} />
          <button className="btn primary wide" data-testid="photo-add" disabled={busy || (cards?.length ?? 0) >= MAX_PHOTOS} onClick={() => input.current?.click()}>{t('photos.add')}</button>
          <p className="muted" data-testid="photos-usage">{t('photos.usage', { n: cards?.length ?? 0, max: MAX_PHOTOS, mb: (used / 1048576).toFixed(1), maxmb: Math.round(MAX_TOTAL_BYTES / 1048576) })}</p>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="photos-errors" role="alert" data-testid="photos-errors">
          {errors.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}

      {cards && cards.length === 0 && !locked && <p className="muted photos-empty" data-testid="photos-empty">{t('photos.empty')}</p>}

      {cards && cards.length > 0 && (
        <ul className="gallery photos-grid" data-testid="photos-grid">
          {cards.map((c) => (
            <li key={c.meta.id}>
              <Link to={`/art-slide/play/${photoArtworkId(c.meta.id)}`} className={`gcard${locked ? ' locked' : ''}`} data-testid={`photo-${c.meta.id}`}>
                <img src={c.thumbUrl} alt={c.meta.name} width={Math.round(c.meta.width / 4)} height={Math.round(c.meta.height / 4)} />
                <span className="g-title" title={c.meta.name}>{c.meta.name}</span>
                <span className="g-meta">{best(c.meta.id) !== undefined ? t('photos.best', { time: formatTime(best(c.meta.id)!) }) : ' '}</span>
              </Link>
              <button className="photo-del" data-testid={`photo-del-${c.meta.id}`} aria-label={`${t('photos.delete')}: ${c.meta.name}`} title={t('photos.delete')} onClick={() => void del(c)}>×</button>
            </li>
          ))}
        </ul>
      )}

      <p className="muted photos-note">{t('photos.private')}</p>
      <p className="muted photos-note">{t('photos.kept')}</p>
    </div>
  );
}
