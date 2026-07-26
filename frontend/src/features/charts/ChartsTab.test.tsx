import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as client from '../../api/client'
import { ChartsTab } from './ChartsTab'

vi.mock('../../api/client')

afterEach(() => {
  vi.resetAllMocks()
})

const trendRow = (month: string, savings: number) => ({
  年月: month,
  収入: 500000,
  夫収入: 300000,
  妻収入: 200000,
  支出: 200000,
  投資: 30000,
  貯金: savings,
  累計貯金: savings,
  投資累計: 30000,
  純資産: savings + 30000,
})

describe('ChartsTab', () => {
  it('shows a loading state before data resolves', () => {
    vi.mocked(client.getCharts).mockReturnValue(new Promise(() => {}))
    render(<ChartsTab month="2026-02" />)
    expect(screen.getByTestId('charts-loading')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    vi.mocked(client.getCharts).mockRejectedValue(new Error('boom'))
    render(<ChartsTab month="2026-02" />)
    await waitFor(() => expect(screen.getByTestId('charts-error')).toHaveTextContent('boom'))
  })

  it('renders all four charts with a previous month present', async () => {
    vi.mocked(client.getCharts).mockResolvedValue({
      month: '2026-02',
      expense_breakdown: [{ カテゴリ: '家賃', グループ: '固定費', 金額: 85000 }],
      group_totals_current: [{ グループ: '固定費', 金額: 85000, 月: '2026-02' }],
      group_totals_previous: [{ グループ: '固定費', 金額: 80000, 月: '2026-01' }],
      trend: [trendRow('2026-01', 270000), trendRow('2026-02', 242600)],
    })

    render(<ChartsTab month="2026-02" />)

    await waitFor(() => expect(screen.getByTestId('charts-tab')).toBeInTheDocument())
    expect(screen.getByTestId('expense-pie')).toBeInTheDocument()
    expect(screen.getByTestId('expense-table')).toBeInTheDocument()
    expect(screen.getByTestId('group-bar')).toBeInTheDocument()
    expect(screen.getByTestId('asset-trend-line')).toBeInTheDocument()
    expect(screen.getByTestId('savings-bar')).toBeInTheDocument()
  })

  it('shows the group-bar empty state for the first month (no previous month in trend)', async () => {
    vi.mocked(client.getCharts).mockResolvedValue({
      month: '2026-01',
      expense_breakdown: [],
      group_totals_current: [],
      group_totals_previous: [],
      trend: [trendRow('2026-01', 270000)],
    })

    render(<ChartsTab month="2026-01" />)

    await waitFor(() => expect(screen.getByTestId('group-bar-empty')).toBeInTheDocument())
    expect(screen.queryByTestId('expense-table')).toBeNull()
  })
})
