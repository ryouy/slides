import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

/** Thin, round-ended strokes so all navigation arrows share one calm style. */
function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: IconProps) => <Svg {...p}><path d="M14.5 5.5 8 12l6.5 6.5" /></Svg>;
export const ChevronRight = (p: IconProps) => <Svg {...p}><path d="M9.5 5.5 16 12l-6.5 6.5" /></Svg>;

/** Round, quiet back button used in every top bar. */
export function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className="icon-btn back-btn" onClick={onClick} aria-label={label}>
      <ChevronLeft size={22} />
    </button>
  );
}
