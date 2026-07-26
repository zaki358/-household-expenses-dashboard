import type { ReactNode } from 'react'

export interface NavProps {
  /** Left logo/title slot. */
  logo: ReactNode
  /** Center nav-items slot (e.g. tab links: Dashboard / Charts / Entry / Goal / Settings). */
  navItems?: ReactNode
  /** Right cluster slot (e.g. search/account icons). */
  rightCluster?: ReactNode
  className?: string
}

/**
 * `primary-nav` from DESIGN.md — black background, ~48px height. Pure
 * chrome component: no real navigation/routing logic, just the layout
 * slots for logo / centered nav items / right-cluster icons.
 */
export function Nav({ logo, navItems, rightCluster, className = '' }: NavProps) {
  return (
    <nav className={`w-full h-[56px] bg-canvas-dark text-on-dark rounded-none border-b border-hairline-dark ${className}`}>
      <div className="mx-auto flex h-full max-w-[1180px] items-center justify-between px-lg">
        <div className="flex items-center" data-testid="nav-logo">
          {logo}
        </div>
        <div className="flex items-center gap-xs font-body font-medium text-[15px] leading-[1.25] tracking-[0.3px]" data-testid="nav-items">
          {navItems}
        </div>
        <div className="flex items-center gap-sm" data-testid="nav-right-cluster">
          {rightCluster}
        </div>
      </div>
    </nav>
  )
}
