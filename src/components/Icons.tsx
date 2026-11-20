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

export const LockIcon = (p: IconProps) => <Svg {...p}><rect x="5.5" y="11" width="13" height="9" rx="2" /><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" /></Svg>;

/** Round, quiet back button used in every top bar. */
export function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className="icon-btn back-btn" onClick={onClick} aria-label={label}>
      <ChevronLeft size={22} />
    </button>
  );
}

/** A five-point star: outline, or filled when `filled`. */
export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <svg className={p.className} width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />
  </svg>
);
