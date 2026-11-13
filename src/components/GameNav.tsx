import { useT } from '../i18n';
import { Link } from './Link';

/** Top-left link from BIG SLIDE / WORD SLIDE back to the main page (ART SLIDE). */
export function BackToMain() {
  const t = useT();
  return (
    <Link to="/" className="all-games" data-testid="to-main">
      <span aria-hidden="true">‹</span> {t('common.toMain')}
    </Link>
  );
}
