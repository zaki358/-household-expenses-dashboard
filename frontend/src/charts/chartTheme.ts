import { chartPalette, colors } from '../theme/tokens'

export { chartPalette }

/**
 * Recharts needs raw color strings (not Tailwind classes), so this module
 * adapts `chartPalette`/`colors` from theme/tokens.ts into the shapes the
 * chart components below consume directly.
 */

/** Fixed semantic colors for the asset-trend line series. */
export const trendSeriesColors = {
  累計貯金: chartPalette.lead,
  投資累計: chartPalette.tonal1,
  純資産: chartPalette.negative,
} as const

export const gridColor = colors.hairlineDark
export const axisTextColor = colors.onDarkMute
export const tooltipStyle = {
  backgroundColor: colors.surfaceDarkElevated,
  border: `1px solid ${colors.hairlineDark}`,
  borderRadius: 8,
  fontFamily: "'Inter', Arial, Helvetica, sans-serif",
  fontSize: 14,
  color: colors.onDark,
} as const
