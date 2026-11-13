import { useT } from '../i18n';
import { ChevronLeft } from './Icons';
import { Link } from './Link';

/** Top-left link from BIG SLIDE / WORD SLIDE back to the main page (ART SLIDE). */
export function BackToMain() {
  const t = useT();
  return (
    <Link to="/" className="all-games" data-testid="to-main">
      <ChevronLeft size={16} />
      {t('common.toMain')}
    </Link>
  );
}
