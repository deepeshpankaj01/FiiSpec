import { cn } from '@/lib/utils';

/**
 * FiiSpec mark: a specification document whose "F" strokes end in connected
 * nodes — the specification, and the standards relationships built around it.
 */
export function LogoMark({ className, title = 'FiiSpec' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 40 40" role="img" aria-label={title} className={cn('size-8 shrink-0', className)}>
      <path d="M9 3h16l9 9v22.5A2.5 2.5 0 0 1 31.5 37h-22A3.5 3.5 0 0 1 6 33.5v-27A3.5 3.5 0 0 1 9 3z" fill="#0b2545" />
      <path d="M25 3v6.5A2.5 2.5 0 0 0 27.5 12H34z" fill="#1d4577" />
      <path d="M14 11.5v19" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M14 13h9.5M14 21h7" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M21 21l6 6.5" stroke="#fde6cc" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24.5" cy="13" r="2.6" fill="#fff" />
      <circle cx="21.5" cy="21" r="2.8" fill="#e07a1f" />
      <circle cx="27.5" cy="28" r="2.2" fill="#e07a1f" />
    </svg>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('text-lg font-semibold tracking-tight', inverted ? 'text-white' : 'text-navy-900')}>
        Fii<span className="text-saffron-500">Spec</span>
      </span>
    </span>
  );
}
