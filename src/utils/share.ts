/** Public address of the site: VITE_SITE_URL when set (production), else wherever the page is opened. */
export function siteOrigin(): string {
  const env = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '');
  if (env) return env;
  return typeof location !== 'undefined' ? location.origin : '';
}

/** Link that SNS can preview with the painting as a puzzle (see scripts/make-share-assets.ts). */
export const artShareUrl = (artworkId: string, daily: boolean) => `${siteOrigin()}/s/${artworkId}/${daily ? '?d=1' : ''}`;

/** Where each service takes `text` and `url` (the link is passed separately so the service can preview it). */
export function shareLinks(text: string, url: string) {
  const e = encodeURIComponent;
  return {
    x: `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}&quote=${e(text)}`,
    line: `https://social-plugins.line.me/lineit/share?url=${e(url)}&text=${e(text)}`,
  };
}
