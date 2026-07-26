import type { ReactNode } from 'react'

export interface BadgeProps {
  children: ReactNode
  className?: string
}

/**
 * `badge-info` from DESIGN.md — small pill info tag, primary blue
 * background, caption-sm text. E.g. "New", "Over budget" labels.
 */
export function Badge({ children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-primary text-on-dark font-body font-medium text-[12px] leading-[1.8] px-sm py-xxs ${className}`}
    >
      {children}
    </span>
  )
}
