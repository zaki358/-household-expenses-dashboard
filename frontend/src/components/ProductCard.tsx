import type { HTMLAttributes, ReactNode } from 'react'

export type ProductCardVariant = 'light' | 'dark'

export interface ProductCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: ProductCardVariant
  /**
   * Pressed/active state — the system has no resting shadow; cards lift
   * only on press (DESIGN.md Elevation & Depth, level 2: soft active shadow).
   */
  active?: boolean
  children: ReactNode
}

const variantClasses: Record<ProductCardVariant, string> = {
  light: 'bg-surface-card text-ink',
  dark: 'bg-surface-dark-card text-on-dark',
}

/**
 * `product-card` (light) / `product-card-dark` (dark) from DESIGN.md.
 * 8px radius, 24px padding, no resting shadow — shadow only appears via
 * the `active`/pressed state.
 */
export function ProductCard({ variant = 'light', active = false, className = '', children, ...rest }: ProductCardProps) {
  const shadowClass = active ? 'shadow-[0_4px_12px_rgba(0,0,0,0.16)]' : 'shadow-none'

  return (
    <div
      data-variant={variant}
      data-active={active}
      className={`rounded-md p-lg ${variantClasses[variant]} ${shadowClass} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
