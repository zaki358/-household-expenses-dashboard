import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface FilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: ReactNode
}

/**
 * `filter-pill` / `filter-pill-active` from DESIGN.md. Default: translucent
 * `surface-filter` fill. Active: flips to opaque `canvas-light` — the chip
 * "lifts" from the translucent default.
 */
export function FilterPill({ active = false, className = '', children, ...rest }: FilterPillProps) {
  const stateClasses = active
    ? 'bg-on-dark text-ink'
    : 'bg-transparent text-mute-dark border border-hairline-dark hover:text-on-dark'

  return (
    <button
      type="button"
      data-active={active}
      className={`inline-flex items-center justify-center rounded-full font-body font-bold text-[14px] leading-[1.25] tracking-[0.324px] px-lg py-sm ${stateClasses} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
