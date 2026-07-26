import type { HTMLAttributes, ReactNode } from 'react'

/**
 * Three-canvas band variant per DESIGN.md: dark (canvas-dark), light
 * (canvas-light), or blue (primary / "action moment" — e.g. the Goal tab's
 * hero-band-blue).
 */
export type BandVariant = 'dark' | 'light' | 'blue'

export interface BandProps extends HTMLAttributes<HTMLElement> {
  variant?: BandVariant
  /** Use the larger 96px/48px hero padding instead of the default 48px/24px. */
  hero?: boolean
  children: ReactNode
}

const variantClasses: Record<BandVariant, string> = {
  dark: 'bg-canvas-dark text-on-dark',
  light: 'bg-canvas-light text-ink',
  blue: 'bg-primary text-on-dark',
}

/**
 * Full-bleed section wrapper — the system's chapter divider IS the
 * background color change, so bands carry no border/shadow (`rounded-none`)
 * and stack at `{spacing.section}` (96px) rhythm via vertical padding.
 */
export function Band({ variant = 'light', hero = false, className = '', children, ...rest }: BandProps) {
  const paddingClasses = hero ? 'py-section px-xxl' : 'py-xxl px-lg'

  return (
    <section data-variant={variant} className={`w-full rounded-none ${variantClasses[variant]} ${paddingClasses} ${className}`} {...rest}>
      {children}
    </section>
  )
}
