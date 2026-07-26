import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as client from '../../api/client'
import { Dashboard } from './Dashboard'

vi.mock('../../api/client')

afterEach(() => {
  vi.resetAllMocks()
})

const baseRow = {
  年月: '2026-02',
  収入: 520000,
  夫収入: 280000,
  妻収入: 200000,
  支出: 277400,
  投資: 30000,
  貯金: 242600,
  累計貯金: 491400,
  投資累計: 60000,
  純資産: 551400,
}

describe('Dashboard', () => {
  it('shows a loading state before data resolves', () => {
    vi.mocked(client.getDashboard).mockReturnValue(new Promise(() => {}))
    render(<Dashboard month="2026-02" />)
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    vi.mocked(client.getDashboard).mockRejectedValue(new Error('データがありません'))
    render(<Dashboard month="2026-02" />)
    await waitFor(() => expect(screen.getByTestId('dashboard-error')).toHaveTextContent('データがありません'))
  })

  it('renders KPI metrics, income split, and the comparison table', async () => {
    vi.mocked(client.getDashboard).mockResolvedValue({
      month: '2026-02',
      current: baseRow,
      comparison: [
        { 項目: '収入', 今月: 520000, 前月: 500000, 差額: 20000, 増減率: 4.0 },
        { 項目: '支出', 今月: 277400, 前月: 271200, 差額: 6200, 増減率: 2.3 },
        { 項目: '投資', 今月: 30000, 前月: 30000, 差額: 0, 増減率: 0 },
        { 項目: '貯金', 今月: 242600, 前月: 248800, 差額: -6200, 増減率: -2.5 },
      ],
    })

    render(<Dashboard month="2026-02" />)

    await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument())

    expect(screen.getByText('2026-02 のサマリー')).toBeInTheDocument()
    expect(screen.getByTestId('comparison-table')).toBeInTheDocument()
    expect(screen.getByTestId('income-split')).toHaveTextContent('その他')
    // 夫収入+妻収入=480000、収入合計520000 → その他収入は40000
    expect(screen.getByTestId('income-split')).toHaveTextContent('40,000')
  })

  it('shows a no-comparison message for the first month', async () => {
    vi.mocked(client.getDashboard).mockResolvedValue({
      month: '2026-01',
      current: { ...baseRow, 年月: '2026-01' },
      comparison: null,
    })

    render(<Dashboard month="2026-01" />)

    await waitFor(() => expect(screen.getByTestId('no-comparison')).toBeInTheDocument())
    expect(screen.queryByTestId('comparison-table')).not.toBeInTheDocument()
  })
})
