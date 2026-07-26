import type { HTMLAttributes, ReactNode } from 'react'

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/**
 * Centered content column. Bands are full-bleed per DESIGN.md ("the section
 * background change IS the divider"), but their *content* is constrained to
 * the documented ~1280px max-width content area so wide screens don't stretch
 * KPI cards and tables edge-to-edge. Pair this inside every full-bleed band.
 */
export function Container({ className = '', children, ...rest }: ContainerProps) {
  return (
    <div className={`mx-auto w-full max-w-[1180px] ${className}`} {...rest}>
      {children}
    </div>
  )
}
