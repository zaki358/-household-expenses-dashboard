import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from './api/client'
import App from './App'

vi.mock('./api/client')

const baseRow = {
  年月: '2026-07',
  収入: 0,
  夫収入: 0,
  妻収入: 0,
  支出: 0,
  投資: 0,
  貯金: 0,
  累計貯金: 0,
  投資累計: 0,
  純資産: 0,
}

function mockDashboard(month: string) {
  vi.mocked(client.getDashboard).mockResolvedValue({
    month,
    current: { ...baseRow, 年月: month },
    comparison: null,
  })
}

beforeEach(() => {
  // 今日を 2026-07-26 に固定する。setSystemTime は Date のみを差し替え、
  // setTimeout 等は実物のまま動くため waitFor はそのまま使える。
  vi.setSystemTime(new Date(2026, 6, 26))
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('App - 初期選択月', () => {
  it('未来月(2026-11)が最新でも、今月(2026-07)を選択する', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-07', '2026-10', '2026-11'],
      summary: [],
      warnings: [],
    })
    mockDashboard('2026-07')

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('month-selector')).toBeInTheDocument())

    const julPill = screen.getByRole('button', { name: '2026-07' })
    const novPill = screen.getByRole('button', { name: '2026-11' })
    expect(julPill).toHaveAttribute('data-active', 'true')
    expect(novPill).toHaveAttribute('data-active', 'false')

    await waitFor(() => expect(client.getDashboard).toHaveBeenCalledWith('2026-07'))
    expect(client.getDashboard).not.toHaveBeenCalledWith('2026-11')
  })

  it('データがある月すべてがピルに並び、クリックで切り替えられる', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-07', '2026-10', '2026-11'],
      summary: [],
      warnings: [],
    })
    mockDashboard('2026-07')
    mockDashboard('2026-10')

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('month-selector')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '2026-07' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-11' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '2026-10' }))

    await waitFor(() => expect(client.getDashboard).toHaveBeenCalledWith('2026-10'))
    expect(screen.getByRole('button', { name: '2026-10' })).toHaveAttribute('data-active', 'true')
  })

  it('今月にまだデータが無くても、ピルに今月が表示され選択される', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-05', '2026-06'],
      summary: [],
      warnings: [],
    })

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('month-selector')).toBeInTheDocument())

    const julPill = screen.getByRole('button', { name: '2026-07' })
    expect(julPill).toHaveAttribute('data-active', 'true')

    expect(await screen.findByText('2026-07 のデータはまだありません')).toBeInTheDocument()
    expect(client.getDashboard).not.toHaveBeenCalled()
  })

  it('過去月のピルをクリックするとその月のダッシュボードに切り替わる', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-05', '2026-06'],
      summary: [],
      warnings: [],
    })
    mockDashboard('2026-06')

    render(<App />)

    await screen.findByText('2026-07 のデータはまだありません')

    fireEvent.click(screen.getByRole('button', { name: '2026-06' }))

    await waitFor(() => expect(client.getDashboard).toHaveBeenCalledWith('2026-06'))
    expect(screen.getByRole('button', { name: '2026-06' })).toHaveAttribute('data-active', 'true')
  })

  it('データが1件も無いコールドスタートでは既存のオンボーディング文言を出す', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({ months: [], summary: [], warnings: [] })

    render(<App />)

    expect(await screen.findByText('データがありません')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-07' })).toBeInTheDocument()
    expect(client.getDashboard).not.toHaveBeenCalled()
  })

  it('入力タブは常に今月を渡す', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-11'],
      summary: [],
      warnings: [],
    })
    // EntryTab の getConfig は解決させず「読み込み中」のまま止めて、
    // getEntries 等の追加モックを不要にする。
    vi.mocked(client.getConfig).mockReturnValue(new Promise(() => {}))

    render(<App />)

    // デスクトップNavとモバイルタブバーの両方に「入力」ボタンがあるため先頭を使う。
    fireEvent.click(screen.getAllByRole('button', { name: '入力' })[0])

    expect(await screen.findByText('データ入力 — 2026-07')).toBeInTheDocument()
  })
})
