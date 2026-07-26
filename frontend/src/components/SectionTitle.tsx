import type { ReactNode } from 'react'

export type SectionTitleLevel = 'display-xl' | 'display-lg' | 'display-md' | 'heading-xl' | 'heading-lg' | 'heading-md'

export interface SectionTitleProps {
  level?: SectionTitleLevel
  children: ReactNode
  className?: string
}

// Tailwind utility strings per typography token (size / weight / line-height / letter-spacing).
// Display tiers (300 weight) use the Roboto Light display font; heading-md (600) uses Inter/body.
const levelClasses: Record<SectionTitleLevel, string> = {
  'display-xl': 'font-display font-light text-[54px] leading-[1.25] tracking-[-0.1px]',
  'display-lg': 'font-display font-light text-[44px] leading-[1.25] tracking-[0.1px]',
  'display-md': 'font-display font-light text-[35px] leading-[1.25] tracking-[0px]',
  'heading-xl': 'font-display font-light text-[28px] leading-[1.25] tracking-[0.1px]',
  'heading-lg': 'font-display font-light text-[22px] leading-[1.25] tracking-[0.1px]',
  'heading-md': 'font-body font-semibold text-[18px] leading-[1] tracking-[0px]',
}

// Heading levels map to semantic HTML tags by visual rank.
const levelTags: Record<SectionTitleLevel, 'h1' | 'h2' | 'h3'> = {
  'display-xl': 'h1',
  'display-lg': 'h1',
  'display-md': 'h2',
  'heading-xl': 'h2',
  'heading-lg': 'h3',
  'heading-md': 'h3',
}

/**
 * Headline component spanning the display/heading typography scale
 * (`display-xl/lg/md`, `heading-xl/lg/md` from DESIGN.md). Display tiers
 * render at weight 300 — the brand's signature airy editorial voice.
 */
export function SectionTitle({ level = 'heading-md', children, className = '' }: SectionTitleProps) {
  const Tag = levelTags[level]

  return (
    <Tag data-level={level} className={`${levelClasses[level]} ${className}`}>
      {children}
    </Tag>
  )
}
