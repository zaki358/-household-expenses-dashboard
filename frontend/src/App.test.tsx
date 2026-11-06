import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from './api/client'
import App from './App'

vi.mock('./api/client')

function ensureMonthResult(month: string, created = false) {
  return { month, created, base: created ? '2026-06' : null, carried_entries: 0, carried_bundle_items: 0 }
}

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

/**
 * 起動時の既定タブは「入力」なので、ダッシュボードを検証するテストは明示的に
 * タブを切り替える。デスクトップNavとモバイルタブバーの両方にボタンがあるため先頭を使う。
 */
function goToDashboard() {
  fireEvent.click(screen.getAllByRole('button', { name: 'ダッシュボード' })[0])
}

beforeEach(() => {
  // 今日を 2026-07-26 に固定する。setSystemTime は Date のみを差し替え、
  // setTimeout 等は実物のまま動くため waitFor はそのまま使える。
  vi.setSystemTime(new Date(2026, 6, 26))
  // 既定タブが entry になったため、全テストで EntryTab がマウントされる。
  // 個別に検証しないテストのために安全な既定モックを置く（config は未解決のまま）。
  vi.mocked(client.getConfig).mockReturnValue(new Promise(() => {}))
  vi.mocked(client.getEntries).mockResolvedValue([])
  vi.mocked(client.getBundleItems).mockResolvedValue([])
  vi.mocked(client.getWarikanStatus).mockResolvedValue({ enabled: false })
  // 当月シートの自動準備。個別に検証しないテストのための既定モック（何もしない）。
  vi.mocked(client.ensureCurrentMonth).mockResolvedValue(ensureMonthResult('2026-07'))
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
      current_month: '2026-07',
    })
    mockDashboard('2026-07')

    render(<App />)
    goToDashboard()

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
      current_month: '2026-07',
    })
    mockDashboard('2026-07')
    mockDashboard('2026-10')

    render(<App />)
    goToDashboard()

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
      current_month: '2026-07',
    })
    // summary解決前は楽観的にDashboardを描き始めるため、404になる想定のdashboard取得も発生する。
    mockDashboard('2026-07')

    render(<App />)
    goToDashboard()

    await waitFor(() => expect(screen.getByTestId('month-selector')).toBeInTheDocument())

    const julPill = screen.getByRole('button', { name: '2026-07' })
    expect(julPill).toHaveAttribute('data-active', 'true')

    expect(await screen.findByText('2026-07 のデータはまだありません')).toBeInTheDocument()
  })

  it('過去月のピルをクリックするとその月のダッシュボードに切り替わる', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-05', '2026-06'],
      summary: [],
      warnings: [],
      current_month: '2026-07',
    })
    mockDashboard('2026-06')

    render(<App />)
    goToDashboard()

    await screen.findByText('2026-07 のデータはまだありません')

    fireEvent.click(screen.getByRole('button', { name: '2026-06' }))

    await waitFor(() => expect(client.getDashboard).toHaveBeenCalledWith('2026-06'))
    expect(screen.getByRole('button', { name: '2026-06' })).toHaveAttribute('data-active', 'true')
  })

  it('データが1件も無いコールドスタートでは既存のオンボーディング文言を出す', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({ months: [], summary: [], warnings: [], current_month: '2026-07' })
    // summary解決前は楽観的にDashboardを描き始めるため、404になる想定のdashboard取得も発生する。
    mockDashboard('2026-07')

    render(<App />)
    goToDashboard()

    expect(await screen.findByText('データがありません')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-07' })).toBeInTheDocument()
  })

  it('summaryの解決を待たずにdashboardを取りに行く(直列待ちしない)', async () => {
    // getSummaryを解決させず、getDashboardが先に呼ばれることを確認する。
    vi.mocked(client.getSummary).mockReturnValue(new Promise(() => {}))
    mockDashboard('2026-07')

    render(<App />)
    goToDashboard()

    await waitFor(() => expect(client.getDashboard).toHaveBeenCalledWith('2026-07'))
    expect(await screen.findByTestId('dashboard')).toBeInTheDocument()
  })

  it('起動時は「入力」タブが開く', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-07'],
      summary: [],
      warnings: [],
      current_month: '2026-07',
    })

    render(<App />)

    // タブを一切クリックせずに入力画面が出ている。
    expect(await screen.findByText('データ入力 — 2026-07')).toBeInTheDocument()
    expect(client.getDashboard).not.toHaveBeenCalled()
  })

  it('データがある月が未来月だけでも、入力タブは今月を渡す', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-11'],
      summary: [],
      warnings: [],
      current_month: '2026-07',
    })
    mockDashboard('2026-07')

    render(<App />)

    // 一度ダッシュボードへ移動してから入力タブへ戻っても今月のまま。
    goToDashboard()
    // デスクトップNavとモバイルタブバーの両方に「入力」ボタンがあるため先頭を使う。
    fireEvent.click(screen.getAllByRole('button', { name: '入力' })[0])

    expect(await screen.findByText('データ入力 — 2026-07')).toBeInTheDocument()
  })
})

describe('App - 当月シートの自動準備', () => {
  it('マウント時に ensureCurrentMonth を1回だけ呼ぶ（StrictModeの二重マウントでも）', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-07'],
      summary: [],
      warnings: [],
      current_month: '2026-07',
    })

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await screen.findByText('データ入力 — 2026-07')
    expect(client.ensureCurrentMonth).toHaveBeenCalledTimes(1)
  })

  it('created:true なら summary を取り直し、入力タブの引き継ぎ項目を再読込する', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-06', '2026-07'],
      summary: [],
      warnings: [],
      current_month: '2026-07',
    })
    vi.mocked(client.ensureCurrentMonth).mockResolvedValue(ensureMonthResult('2026-07', true))

    render(<App />)

    await screen.findByText('データ入力 — 2026-07')
    // 作成された（created:true）ため、summary が再取得され、入力タブ（EntryTab）が
    // key の変更で作り直されて、既定タブ（変動費）の getEntries も再度呼ばれる。
    await waitFor(() => expect(client.getSummary).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(client.getEntries).toHaveBeenCalledTimes(2))
  })

  it('created:false なら再取得しない', async () => {
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-07'],
      summary: [],
      warnings: [],
      current_month: '2026-07',
    })
    vi.mocked(client.ensureCurrentMonth).mockResolvedValue(ensureMonthResult('2026-07', false))

    render(<App />)

    await screen.findByText('データ入力 — 2026-07')
    await waitFor(() => expect(client.ensureCurrentMonth).toHaveBeenCalledTimes(1))
    // 入力タブは作り直されない = 初回マウント1回分のみ getEntries を呼ぶ。
    expect(client.getSummary).toHaveBeenCalledTimes(1)
    expect(client.getEntries).toHaveBeenCalledTimes(1)
  })

  it('サーバーの current_month(JST) を選択月として採用する（ブラウザローカル時刻と食い違っていても）', async () => {
    // ブラウザのローカル時刻は 2026-07-26（beforeEach）のままだが、サーバーは 2026-08 を返す
    // ケース（端末TZがJSTとズレている状況を模す）。
    vi.mocked(client.getSummary).mockResolvedValue({
      months: ['2026-07', '2026-08'],
      summary: [],
      warnings: [],
      current_month: '2026-08',
    })
    vi.mocked(client.ensureCurrentMonth).mockResolvedValue(ensureMonthResult('2026-08'))
    mockDashboard('2026-08')

    render(<App />)
    goToDashboard()

    await waitFor(() => expect(screen.getByTestId('month-selector')).toBeInTheDocument())

    const augPill = screen.getByRole('button', { name: '2026-08' })
    expect(augPill).toHaveAttribute('data-active', 'true')
    await waitFor(() => expect(client.getDashboard).toHaveBeenCalledWith('2026-08'))
  })
})
