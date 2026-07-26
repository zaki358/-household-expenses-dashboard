import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MonthlySummaryRow } from '../../api/types'
import { SavingsBar } from '../SavingsBar'

const row: MonthlySummaryRow = {
  年月: '2026-01',
  収入: 500000,
  夫収入: 300000,
  妻収入: 200000,
  支出: 200000,
  投資: 30000,
  貯金: 270000,
  累計貯金: 270000,
  投資累計: 30000,
  純資産: 300000,
}

describe('SavingsBar', () => {
  it('renders the chart container', () => {
    render(<SavingsBar data={[row]} />)
    expect(screen.getByTestId('savings-bar')).toBeInTheDocument()
  })
})
