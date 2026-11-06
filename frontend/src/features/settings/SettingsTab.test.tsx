import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../../api/client'
import type { ConfigOut } from '../../api/types'
import { SettingsTab } from './SettingsTab'

vi.mock('../../api/client')

function baseConfig(overrides: Partial<ConfigOut> = {}): ConfigOut {
  return {
    investment_as_expense: true,
    categories: { 変動費: ['食費', '不明'], 収入: ['夫給与'] },
    category_usage: { 食費: 26 },
    active_goal: null,
    dashboard_months: [],
    ...overrides,
  }
}

function todayMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// NextMonthSection（このタブに常に存在する）が起動時に getSummary を叩くため、
// 個別テストで上書きしない限りの既定値を用意する。
beforeEach(() => {
  vi.mocked(client.getSummary).mockResolvedValue({
    months: [],
    summary: [],
    warnings: [],
    current_month: todayMonth(),
  })
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('SettingsTab - カテゴリ管理', () => {
  it('未使用カテゴリには削除ボタンがあり、押すと deleteCategory が呼ばれる', async () => {
    vi.mocked(client.getGoals).mockResolvedValue([])
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.deleteCategory).mockResolvedValue(
      baseConfig({ categories: { 変動費: ['食費'], 収入: ['夫給与'] } }),
    )

    render(<SettingsTab />)

    const row = await screen.findByText('不明')
    const deleteButton = row.closest('tr')!.querySelector('button')!
    expect(deleteButton).toHaveTextContent('削除')

    fireEvent.click(deleteButton)

    await waitFor(() => expect(client.deleteCategory).toHaveBeenCalledWith('不明'))
  })

  it('使用中カテゴリは件数を表示し削除ボタンを出さない', async () => {
    vi.mocked(client.getGoals).mockResolvedValue([])
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())

    render(<SettingsTab />)

    const row = (await screen.findByText('食費')).closest('tr')!
    expect(row).toHaveTextContent('使用中 26件')
    expect(row.querySelector('button')).toBeNull()
  })

  it('サーバーが拒否した場合はエラーメッセージを表示する', async () => {
    vi.mocked(client.getGoals).mockResolvedValue([])
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.deleteCategory).mockRejectedValue(
      new Error('「夫給与」は夫婦の収入内訳の集計に使う特別なカテゴリのため削除できません'),
    )

    render(<SettingsTab />)

    const row = (await screen.findByText('夫給与')).closest('tr')!
    fireEvent.click(row.querySelector('button')!)

    expect(await screen.findByText(/夫婦の収入内訳の集計に使う特別なカテゴリ/)).toBeInTheDocument()
  })
})

function shiftMonth(base: string, n: number): string {
  const [y, m] = base.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

describe('SettingsTab - 月削除', () => {
  it('今月・過去月は削除候補に出ない', async () => {
    const today = todayMonth()
    const past = shiftMonth(today, -1)
    const future = shiftMonth(today, 1)
    vi.mocked(client.getGoals).mockResolvedValue([])
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getSummary).mockResolvedValue({
      months: [past, today, future],
      summary: [],
      warnings: [],
      current_month: today,
    })

    render(<SettingsTab />)

    await screen.findByText(future)
    expect(screen.queryByText(today)).toBeNull()
    expect(screen.queryByText(past)).toBeNull()
  })

  it('削除できる月が無ければその旨を表示する', async () => {
    vi.mocked(client.getGoals).mockResolvedValue([])
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getSummary).mockResolvedValue({
      months: [todayMonth()],
      summary: [],
      warnings: [],
      current_month: todayMonth(),
    })

    render(<SettingsTab />)

    expect(await screen.findByText('削除できる月はありません。')).toBeInTheDocument()
  })

  it('月名を打ち込むまで削除ボタンが無効', async () => {
    const future = shiftMonth(todayMonth(), 1)
    vi.mocked(client.getGoals).mockResolvedValue([])
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getSummary).mockResolvedValue({
      months: [future],
      summary: [],
      warnings: [],
      current_month: todayMonth(),
    })

    render(<SettingsTab />)

    fireEvent.click(await screen.findByText(future))
    const deleteButton = await screen.findByRole('button', { name: '削除する' })
    expect(deleteButton).toBeDisabled()
  })

  it('打ち込んで削除すると deleteMonth が呼ばれる', async () => {
    const future = shiftMonth(todayMonth(), 1)
    vi.mocked(client.getGoals).mockResolvedValue([])
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getSummary).mockResolvedValue({
      months: [future],
      summary: [],
      warnings: [],
      current_month: todayMonth(),
    })
    vi.mocked(client.deleteMonth).mockResolvedValue({ month: future, deleted_entries: 0, deleted_bundle_items: 0 })

    render(<SettingsTab />)

    fireEvent.click(await screen.findByText(future))
    const input = screen.getByPlaceholderText(future)
    fireEvent.change(input, { target: { value: future } })
    const deleteButton = screen.getByRole('button', { name: '削除する' })
    expect(deleteButton).not.toBeDisabled()
    fireEvent.click(deleteButton)

    await waitFor(() => expect(client.deleteMonth).toHaveBeenCalledWith(future))
  })
})
