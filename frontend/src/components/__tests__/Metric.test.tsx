import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Metric } from '../Metric'

describe('Metric', () => {
  it('renders the label and formatted currency value', () => {
    render(<Metric label="Total Spend" value={125000} />)
    expect(screen.getByText('Total Spend')).toBeInTheDocument()
    expect(screen.getByText(/125,000/)).toBeInTheDocument()
  })

  it('renders no delta block when delta is omitted', () => {
    render(<Metric label="Total Spend" value={1000} />)
    expect(screen.queryByTestId('metric-delta')).not.toBeInTheDocument()
  })

  it('renders an up delta in primary color by default', () => {
    render(<Metric label="Income" value={1000} delta={200} />)
    const delta = screen.getByTestId('metric-delta')
    expect(delta.className).toContain('text-primary')
  })

  it('inverts delta color for expense metrics where an increase is bad', () => {
    render(<Metric label="Expenses" value={1000} delta={200} invertDeltaColor />)
    const delta = screen.getByTestId('metric-delta')
    expect(delta.className).toContain('text-warning')
  })

  it('uses light-on-dark text colors when tone="dark" (avoids black-on-dark-card contrast bug)', () => {
    render(<Metric label="Net Worth" value={1000} tone="dark" />)
    const root = screen.getByTestId('metric')
    const value = root.querySelector('p:nth-of-type(2)')
    expect(value?.className).toContain('text-on-dark')
    expect(value?.className).not.toContain('text-ink')
  })

  it('uses a dark-surface delta color (link-dark, not primary) for tone="dark"', () => {
    render(<Metric label="Net Worth" value={1000} delta={200} tone="dark" />)
    const delta = screen.getByTestId('metric-delta')
    expect(delta.className).toContain('text-link-dark')
  })
})
