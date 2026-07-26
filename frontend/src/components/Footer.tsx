import type { ReactNode } from 'react'

export interface FooterProps {
  /** Wordmark / brand title slot at top-left. */
  wordmark: ReactNode
  /** Multi-column link-grid content. */
  children?: ReactNode
  /** Bottom fine-print row (terms / privacy). */
  fineprint?: ReactNode
  className?: string
}

/**
 * `footer-section` from DESIGN.md — PlayStation Blue background, white
 * caption text, a simple link-grid layout. The system's "we're done —
 * return to the brand" anchor band.
 */
export function Footer({ wordmark, children, fineprint, className = '' }: FooterProps) {
  return (
    <footer className={`w-full bg-surface-dark-elevated text-on-dark py-lg px-lg rounded-none border-t border-hairline-dark ${className}`}>
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-md">
        <div className="font-display font-light text-[16px] leading-[1.25]" data-testid="footer-wordmark">
          {wordmark}
        </div>
        <div
          className="flex flex-wrap gap-x-lg gap-y-xs font-body text-[12px] leading-[1.6] text-mute-dark"
          data-testid="footer-links"
        >
          {children}
        </div>
      </div>
      {fineprint && (
        <div className="mx-auto mt-sm w-full max-w-[1180px] font-body text-[11px] leading-[1.6] text-mute-dark" data-testid="footer-fineprint">
          {fineprint}
        </div>
      )}
    </footer>
  )
}
