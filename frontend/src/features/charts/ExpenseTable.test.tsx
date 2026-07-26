import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { colorForCategory } from '../../charts/categoryColors'
import { ExpenseTable } from './ExpenseTable'

const sample = [
  { カテゴリ: '家賃', グループ: '固定費', 金額: 85000 },
  { カテゴリ: '保険', グループ: '固定費', 金額: 10000 },
  { カテゴリ: '食費', グループ: '変動費', 金額: 45000 },
]

describe('ExpenseTable', () => {
  it('shows an empty-state message when there is no expense data', () => {
    render(<ExpenseTable data={[]} month="2026-06" />)
    expect(screen.getByTestId('expense-table-empty')).toHaveTextContent('2026-06 の支出データがありません')
  })

  it('renders group subtotal rows with formatted amounts', () => {
    render(<ExpenseTable data={sample} month="2026-06" />)
    const groupRows = screen.getAllByTestId('expense-table-group-row')
    expect(groupRows.length).toBe(2)
    expect(groupRows[0]).toHaveTextContent('固定費')
    expect(groupRows[0]).toHaveTextContent('￥95,000')
  })

  it('renders category rows with a color swatch matching the pie color', () => {
    render(<ExpenseTable data={sample} month="2026-06" />)
    const categoryRows = screen.getAllByTestId('expense-table-category-row')
    const rentRow = categoryRows.find((row) => within(row).queryByText('家賃'))
    expect(rentRow).toBeDefined()
    const swatch = within(rentRow as HTMLElement).getByTestId('expense-table-swatch')
    expect(swatch).toHaveStyle({ backgroundColor: colorForCategory('家賃') })
  })

  it('renders a grand-total footer row', () => {
    render(<ExpenseTable data={sample} month="2026-06" />)
    const total = screen.getByTestId('expense-table-total')
    expect(total).toHaveTextContent('合計')
    expect(total).toHaveTextContent('￥140,000')
  })
})
