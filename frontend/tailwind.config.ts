import type { Config } from 'tailwindcss'
import { colors, chartPalette, spacing, rounded, fontFamily } from './src/theme/tokens.ts'

/**
 * Tailwind v4 theme mapping for the kakei-dashboard-2 design system.
 *
 * Tailwind v4 is CSS-config-first (see src/theme/global.css `@theme`), but
 * this file mirrors the same token set in TypeScript so that:
 *   - `src/theme/tokens.ts` remains the single source of truth components
 *     can import directly when they need raw values (e.g. for Recharts
 *     `stroke`/`fill` props that take JS values, not Tailwind classes).
 *   - Tailwind utility classes (bg-primary, text-on-dark, rounded-md, etc.)
 *     resolve to the exact same hex/px values as tokens.ts.
 *
 * Loaded into the Tailwind v4 build via `@config "../tailwind.config.ts"`
 * in src/theme/global.css.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        'primary-pressed': colors.primaryPressed,
        'primary-active': colors.primaryActive,
        // Commerce orange — defined for completeness, unused in this app.
        commerce: colors.commerce,
        'commerce-pressed': colors.commercePressed,
        'marathon-yellow': colors.marathonYellow,

        'canvas-dark': colors.canvasDark,
        'surface-dark-elevated': colors.surfaceDarkElevated,
        'surface-dark-card': colors.surfaceDarkCard,
        'canvas-light': colors.canvasLight,
        'surface-soft': colors.surfaceSoft,
        'surface-card': colors.surfaceCard,
        'surface-filter': colors.surfaceFilter,
        'hairline-light': colors.hairlineLight,
        'hairline-dark': colors.hairlineDark,

        ink: colors.ink,
        'ink-deep': colors.inkDeep,
        'ink-elevated': colors.inkElevated,
        'body-light': colors.bodyLight,
        'mute-light': colors.muteLight,
        'ash-light': colors.ashLight,
        'on-dark': colors.onDark,
        'body-dark': colors.bodyDark,
        'on-dark-mute': colors.onDarkMute,
        'mute-dark': colors.muteDark,

        warning: colors.warning,
        'link-light': colors.linkLight,
        'link-dark': colors.linkDark,

        'ps-plus-gold-start': colors.psPlusGoldStart,
        'ps-plus-gold-mid': colors.psPlusGoldMid,
        'ps-plus-gold-end': colors.psPlusGoldEnd,

        'chart-lead': chartPalette.lead,
        'chart-tonal-1': chartPalette.tonal1,
        'chart-tonal-2': chartPalette.tonal2,
        'chart-tonal-3': chartPalette.tonal3,
        'chart-negative': chartPalette.negative,
      },
      fontFamily: {
        display: fontFamily.display.split(', '),
        body: fontFamily.body.split(', '),
      },
      spacing: {
        xxs: spacing.xxs,
        xs: spacing.xs,
        sm: spacing.sm,
        md: spacing.md,
        lg: spacing.lg,
        xl: spacing.xl,
        xxl: spacing.xxl,
        section: spacing.section,
      },
      borderRadius: {
        none: rounded.none,
        sm: rounded.sm,
        md: rounded.md,
        lg: rounded.lg,
        full: rounded.full,
      },
    },
  },
  plugins: [],
} satisfies Config
