/**
 * Design tokens for the kakei-dashboard-2 design system.
 *
 * Source: C:\Users\barub\company\kakei-dashboard-2\DESIGN.md
 *
 * This is a PlayStation-marketing-site-derived design system adapted for a
 * household-budget dashboard. See the "Application to 家計簿ダッシュボード2"
 * section of DESIGN.md for app-specific mapping notes that override the
 * generic marketing assumptions (no commerce/orange CTA in this app; a new
 * categorical chart palette is defined for data visualization).
 */

/** Brand, surface, text, and semantic color tokens. */
export const colors = {
  // Brand & Accent
  primary: '#0070d1',
  primaryPressed: '#0064b7',
  primaryActive: '#004d8d',
  // Commerce orange tokens exist in the source spec but are UNUSED in this
  // app per the household-budget mapping notes (no commerce/store flow).
  // Defined here for completeness only — do not wire into default components.
  commerce: '#d53b00',
  commercePressed: '#aa2f00',
  marathonYellow: '#deff20',

  // Surface
  canvasDark: '#000000',
  surfaceDarkElevated: '#121314',
  surfaceDarkCard: '#181818',
  canvasLight: '#ffffff',
  surfaceSoft: '#f3f3f3',
  surfaceCard: '#f5f7fa',
  surfaceFilter: 'rgba(245,247,250,0.3)',
  hairlineLight: '#f3f3f3',
  hairlineDark: 'rgba(229,229,229,0.2)',

  // Text
  ink: '#000000',
  inkDeep: '#121314',
  inkElevated: '#181818',
  bodyLight: 'rgba(0,0,0,0.6)',
  muteLight: '#6b6b6b',
  ashLight: '#cccccc',
  onDark: '#ffffff',
  bodyDark: 'rgba(255,255,255,0.7)',
  onDarkMute: '#cccccc',
  muteDark: '#d4d4d4',

  // Semantic
  warning: '#c81b3a',
  linkLight: '#0064b7',
  linkDark: '#53b1ff',

  // Brand gradient (PlayStation Plus banner only — not used elsewhere)
  psPlusGoldStart: '#ffce21',
  psPlusGoldMid: '#f5a623',
  psPlusGoldEnd: '#ee8e00',
} as const

/**
 * Categorical chart palette for Recharts data visualization.
 *
 * Not part of the source marketing system (marketing chrome has no
 * data-viz palette) — defined per the household-budget mapping notes.
 * `primary` is the lead series; `warning` is reserved strictly for
 * negative/over-budget signals, never a neutral category slice.
 */
export const chartPalette = {
  lead: colors.primary, // #0070d1
  tonal1: colors.linkDark, // #53b1ff
  tonal2: colors.muteLight, // #6b6b6b
  tonal3: colors.ashLight, // #cccccc
  negative: colors.warning, // #c81b3a — over-budget / negative signal only
} as const

interface TypographyToken {
  size: string
  weight: number
  lineHeight: number
  letterSpacing: string
}

/** Typography scale: size / weight / line-height / letter-spacing per role. */
export const typography = {
  displayXl: { size: '54px', weight: 300, lineHeight: 1.25, letterSpacing: '-0.1px' },
  displayLg: { size: '44px', weight: 300, lineHeight: 1.25, letterSpacing: '0.1px' },
  displayMd: { size: '35px', weight: 300, lineHeight: 1.25, letterSpacing: '0px' },
  headingXl: { size: '28px', weight: 300, lineHeight: 1.25, letterSpacing: '0.1px' },
  headingLg: { size: '22px', weight: 300, lineHeight: 1.25, letterSpacing: '0.1px' },
  headingMd: { size: '18px', weight: 600, lineHeight: 1, letterSpacing: '0px' },
  bodyMd: { size: '18px', weight: 400, lineHeight: 1.5, letterSpacing: '0.1px' },
  bodyStrong: { size: '18px', weight: 500, lineHeight: 1.25, letterSpacing: '0.4px' },
  bodySm: { size: '16px', weight: 400, lineHeight: 1.5, letterSpacing: '0px' },
  captionMd: { size: '14px', weight: 400, lineHeight: 1.5, letterSpacing: '0px' },
  captionSm: { size: '12px', weight: 500, lineHeight: 1.5, letterSpacing: '0px' },
  linkMd: { size: '18px', weight: 400, lineHeight: 1.5, letterSpacing: '0px' },
  buttonLg: { size: '18px', weight: 700, lineHeight: 1.25, letterSpacing: '0.45px' },
  buttonMd: { size: '14px', weight: 700, lineHeight: 1.25, letterSpacing: '0.324px' },
} satisfies Record<string, TypographyToken>

/** Spacing scale, 8px base unit with finer 4px steps and a 96px section rhythm. */
export const spacing = {
  xxs: '4px',
  xs: '8px',
  sm: '12px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  section: '96px',
} as const

/** Border radius scale: structural surfaces flat, cards at 8px, CTAs as pills. */
export const rounded = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '16px',
  full: '9999px',
} as const

/** Font family stacks: Roboto Light (300) for display, Inter for body/chrome. */
export const fontFamily = {
  display: "'Roboto', Arial, Helvetica, sans-serif",
  body: "'Inter', Arial, Helvetica, sans-serif",
} as const

export type ColorToken = keyof typeof colors
export type ChartPaletteToken = keyof typeof chartPalette
export type TypographyToken_ = keyof typeof typography
export type SpacingToken = keyof typeof spacing
export type RoundedToken = keyof typeof rounded
