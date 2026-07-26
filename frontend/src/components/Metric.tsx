export type MetricTone = 'light' | 'dark'

export interface MetricProps {
  label: string
  /** Raw numeric value, formatted as a currency-style number (JPY by default). */
  value: number
  /** Optional delta vs. a prior period, e.g. +12000 or -3.2 (interpreted as the same unit as `value`). */
  delta?: number
  /** Currency code passed to Intl.NumberFormat. Defaults to JPY. */
  currency?: string
  /**
   * For expense-style metrics, an increase (positive delta) is "bad"
   * (should render as the warning color) rather than "good" (default:
   * positive delta = up/good = primary-ish, negative = warning).
   */
  invertDeltaColor?: boolean
  /**
   * Surface this metric is rendered on. Must match the surrounding
   * `ProductCard`'s `variant` so text color stays readable — `Metric` sets
   * its own text colors (it doesn't rely on inheriting from the parent),
   * so this prop exists specifically to avoid black-on-dark/white-on-light
   * contrast bugs when nesting inside `ProductCard variant="dark"`.
   */
  tone?: MetricTone
  className?: string
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDelta(delta: number, currency: string): string {
  const sign = delta > 0 ? '+' : ''
  return `${sign}${formatCurrency(delta, currency)}`
}

const toneClasses: Record<MetricTone, { label: string; value: string; good: string; bad: string; neutral: string }> = {
  light: {
    label: 'text-mute-light',
    value: 'text-ink',
    good: 'text-primary',
    bad: 'text-warning',
    neutral: 'text-mute-light',
  },
  dark: {
    label: 'text-mute-dark',
    value: 'text-on-dark',
    // text-primary (#0070d1) reads poorly on near-black cards; link-dark
    // (#53b1ff) is DESIGN.md's documented brightened-blue for dark surfaces.
    good: 'text-link-dark',
    bad: 'text-warning',
    neutral: 'text-mute-dark',
  },
}

/**
 * KPI metric display — label, currency-formatted value, and an optional
 * delta indicator. Always rendered inside a `ProductCard` per the
 * household-budget mapping notes ("never a bare number").
 */
export function Metric({
  label,
  value,
  delta,
  currency = 'JPY',
  invertDeltaColor = false,
  tone = 'light',
  className = '',
}: MetricProps) {
  const hasDelta = typeof delta === 'number'
  const isUp = hasDelta && delta > 0
  const isDown = hasDelta && delta < 0
  const colors = toneClasses[tone]

  // Default semantics: up = good, down = warning.
  // invertDeltaColor flips this for expense-style metrics where an
  // increase should read as "bad".
  const upIsGood = !invertDeltaColor
  const deltaColorClass = isUp
    ? upIsGood
      ? colors.good
      : colors.bad
    : isDown
      ? upIsGood
        ? colors.bad
        : colors.good
      : colors.neutral

  return (
    <div className={className} data-testid="metric">
      <p className={`font-body text-[14px] leading-[1.8] ${colors.label}`}>{label}</p>
      <p className={`font-display font-light text-[35px] leading-[1.25] ${colors.value}`}>
        {formatCurrency(value, currency)}
      </p>
      {hasDelta && (
        <p className={`font-body text-[14px] leading-[1.8] ${deltaColorClass}`} data-testid="metric-delta">
          {isUp ? '↑' : isDown ? '↓' : ''} {formatDelta(delta, currency)}
        </p>
      )}
    </div>
  )
}
