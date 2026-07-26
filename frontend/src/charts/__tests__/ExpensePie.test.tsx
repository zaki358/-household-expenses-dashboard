import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExpensePie } from '../ExpensePie'

describe('ExpensePie', () => {
  it('shows an empty-state message when there is no expense data', () => {
    render(<ExpensePie data={[]} month="2026-06" />)
    expect(screen.getByTestId('expense-pie-empty')).toHaveTextContent('2026-06 の支出データがありません')
  })

  it('renders the chart container when data is present', () => {
    render(
      <ExpensePie
        data={[
          { カテゴリ: '家賃', グループ: '固定費', 金額: 85000 },
          { カテゴリ: '食費', グループ: '変動費', 金額: 50000 },
        ]}
        month="2026-06"
      />,
    )
    expect(screen.getByTestId('expense-pie')).toBeInTheDocument()
  })
})
