import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GroupBar } from '../GroupBar'

describe('GroupBar', () => {
  it('shows an empty-state message when there is no previous month', () => {
    render(<GroupBar current={[]} previous={[]} currentMonth="2026-01" previousMonth={null} />)
    expect(screen.getByTestId('group-bar-empty')).toHaveTextContent('前月のデータがありません')
  })

  it('renders the chart container when a previous month exists', () => {
    render(
      <GroupBar
        current={[{ グループ: '固定費', 金額: 85000, 月: '2026-02' }]}
        previous={[{ グループ: '固定費', 金額: 80000, 月: '2026-01' }]}
        currentMonth="2026-02"
        previousMonth="2026-01"
      />,
    )
    expect(screen.getByTestId('group-bar')).toBeInTheDocument()
  })
})
