import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
