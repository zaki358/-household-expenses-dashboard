import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../../api/client'
import type { ConfigOut } from '../../api/types'
import { EntryTab } from './EntryTab'

vi.mock('../../api/client')

function baseConfig(overrides: Partial<ConfigOut> = {}): ConfigOut {
  return {
    investment_as_expense: true,
    categories: { 変動費: ['食費', '消耗品'], 収入: ['夫給与'] },
    category_usage: {},
    active_goal: null,
    dashboard_months: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(client.getEntries).mockResolvedValue([])
  vi.mocked(client.getBundleItems).mockResolvedValue([])
  // 割り勘連携は既定で無効（= 連携前と同じ画面）。有効にするテストは個別に上書きする。
  vi.mocked(client.getWarikanStatus).mockResolvedValue({ enabled: false })
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('EntryTab - configとentriesの並列取得', () => {
  it('configの解決を待たずにentriesを取りに行く(直列待ちしない)', async () => {
    // getConfig を解決させないまま、getEntries が呼ばれることを確認する。
    vi.mocked(client.getConfig).mockReturnValue(new Promise(() => {}))

    render(<EntryTab month="2026-07" />)

    await waitFor(() => expect(client.getEntries).toHaveBeenCalledWith('2026-07', '変動費'))
  })

  it('カテゴリ未着の間はカテゴリ選択と追加ボタンを無効にする', async () => {
    vi.mocked(client.getConfig).mockReturnValue(new Promise(() => {}))

    render(<EntryTab month="2026-07" />)

    // entries の取得完了を待つ（完了するまでパネルは「読み込み中...」を出す）
    await screen.findByText('まだデータがありません。')

    expect(screen.getByLabelText('カテゴリ')).toBeDisabled()
    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()
  })

  it('config到着後はカテゴリが並び、選択と追加が有効になる', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())

    render(<EntryTab month="2026-07" />)

    const select = await screen.findByLabelText('カテゴリ')
    await waitFor(() => expect(select).not.toBeDisabled())

    expect(screen.getByRole('option', { name: '食費' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '消耗品' })).toBeInTheDocument()
    expect(select).toHaveValue('食費')
    expect(screen.getByRole('button', { name: '追加' })).not.toBeDisabled()
  })
})

describe('EntryTab - 編集', () => {
  it('編集ボタン→入力に変わる→保存でupdateEntryが正しい引数で呼ばれる', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-07', カテゴリ: '食費', 金額: 1000, 備考: '' },
    ])
    vi.mocked(client.updateEntry).mockResolvedValue([
      { id: 1, 年月: '2026-07', カテゴリ: '消耗品', 金額: 1500, 備考: '洗剤' },
    ])

    render(<EntryTab month="2026-07" />)

    fireEvent.click(await screen.findByRole('button', { name: '編集' }))

    // 編集行は「保存」ボタンを含む <tr> にスコープして参照する（追加フォームと
    // ラベルが同じテキストになるため、画面全体から getByLabelText すると曖昧になる）。
    const editRow = screen.getByRole('button', { name: '保存' }).closest('tr')!
    fireEvent.change(within(editRow).getByLabelText('カテゴリ'), { target: { value: '消耗品' } })
    fireEvent.change(within(editRow).getByLabelText('金額（円）'), { target: { value: '1500' } })
    fireEvent.change(within(editRow).getByLabelText('詳細（任意）'), { target: { value: '洗剤' } })

    fireEvent.click(within(editRow).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(client.updateEntry).toHaveBeenCalledWith(1, 1500, '消耗品', '洗剤', null))
  })

  it('キャンセルすると編集フォームが閉じて元の表示行に戻る', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-07', カテゴリ: '食費', 金額: 1000, 備考: '' },
    ])

    render(<EntryTab month="2026-07" />)

    fireEvent.click(await screen.findByRole('button', { name: '編集' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    expect(await screen.findByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(client.updateEntry).not.toHaveBeenCalled()
  })
})

describe('EntryTab - 備考', () => {
  it('備考が空の行では2行目が描画されない', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-07', カテゴリ: '食費', 金額: 1000, 備考: '' },
    ])

    render(<EntryTab month="2026-07" />)

    // 「食費」はテーブルの行と追加フォームの <option> の両方に出るため、
    // テーブルにスコープして曖昧さを避ける。
    const table = await screen.findByRole('table')
    const cell = within(table).getByText('食費').closest('td')!
    expect(cell.querySelectorAll('div')).toHaveLength(1)
  })

  it('備考が非空なら2行目として表示される', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-07', カテゴリ: '消耗品', 金額: 3200, 備考: '洗剤' },
    ])

    render(<EntryTab month="2026-07" />)

    const table = await screen.findByRole('table')
    within(table).getByText('消耗品')
    expect(within(table).getByText('洗剤')).toBeInTheDocument()
  })

  it('備考を空のまま追加してもエラーにならずcreateEntryが呼ばれる', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.createEntry).mockResolvedValue([])

    render(<EntryTab month="2026-07" />)

    const amountInput = await screen.findByPlaceholderText('例: 3000')
    fireEvent.change(amountInput, { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => expect(client.createEntry).toHaveBeenCalledWith('2026-07', '食費', 500, '', null))
    expect(screen.queryByText('金額は1以上の整数を入力してください')).toBeNull()
  })
})

describe('EntryTab - 変動費タブのレイアウト', () => {
  it('変動費では追加フォームが一覧より前にある', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-07', カテゴリ: '食費', 金額: 1000, 備考: '' },
    ])

    render(<EntryTab month="2026-07" />)

    const table = await screen.findByRole('table')
    const addHeading = screen.getByRole('heading', { name: '追加' })
    // DOCUMENT_POSITION_FOLLOWING(4) が立っていれば table は addHeading より後ろ＝フォームが上。
    expect(addHeading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('収入タブでは従来どおり一覧がフォームより前にある', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-07', カテゴリ: '夫給与', 金額: 300000, 備考: '' },
    ])

    render(<EntryTab month="2026-07" />)

    fireEvent.click(await screen.findByRole('button', { name: '収入' }))
    const table = await screen.findByRole('table')
    const addHeading = screen.getByRole('heading', { name: '追加' })
    // table が addHeading より前＝一覧が上・フォームが下（従来どおり）。
    expect(table.compareDocumentPosition(addHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('変動費の一覧は新しい順（id降順）で表示される', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-07', カテゴリ: '食費', 金額: 100, 備考: '' },
      { id: 2, 年月: '2026-07', カテゴリ: '食費', 金額: 200, 備考: '' },
      { id: 3, 年月: '2026-07', カテゴリ: '食費', 金額: 300, 備考: '' },
    ])

    render(<EntryTab month="2026-07" />)

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1) // ヘッダー行を除く
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('300'),
      expect.stringContaining('200'),
      expect.stringContaining('100'),
    ])
  })

  it('収入タブの一覧は従来どおり id 昇順のまま', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-07', カテゴリ: '夫給与', 金額: 100, 備考: '' },
      { id: 2, 年月: '2026-07', カテゴリ: '夫給与', 金額: 200, 備考: '' },
      { id: 3, 年月: '2026-07', カテゴリ: '夫給与', 金額: 300, 備考: '' },
    ])

    render(<EntryTab month="2026-07" />)

    fireEvent.click(await screen.findByRole('button', { name: '収入' }))
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('100'),
      expect.stringContaining('200'),
      expect.stringContaining('300'),
    ])
  })
})

describe('EntryTab - 変動費の並べ替え', () => {
  const sortData = () => [
    { id: 1, 年月: '2026-09', カテゴリ: '食費', 金額: 500, 備考: '', 日: 10 },
    { id: 2, 年月: '2026-09', カテゴリ: '食費', 金額: 100, 備考: '', 日: null },
    { id: 3, 年月: '2026-09', カテゴリ: '食費', 金額: 900, 備考: '', 日: 25 },
  ]

  const amountsInTable = async () => {
    const table = await screen.findByRole('table')
    return within(table).getAllByRole('row').slice(1).map((r) => r.textContent)
  }

  it('並べ替えを選ぶと表示順が変わり、APIの書き込みは呼ばれない', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue(sortData())

    render(<EntryTab month="2026-09" currentMonth="2026-09" />)

    const sortSelect = await screen.findByLabelText('並べ替え')
    expect(sortSelect).toHaveValue('input')

    const cases: [string, RegExp[]][] = [
      ['amountDesc', [/900/, /500/, /100/]],
      ['amountAsc', [/100/, /500/, /900/]],
      ['dayNewest', [/9\/25/, /9\/10/, /100/]],
      ['dayOldest', [/9\/10/, /9\/25/, /100/]],
      ['input', [/900/, /100/, /500/]],
    ]
    for (const [key, expected] of cases) {
      fireEvent.change(screen.getByLabelText('並べ替え'), { target: { value: key } })
      expect(await amountsInTable()).toEqual(expected.map((re) => expect.stringMatching(re)))
    }

    expect(client.getEntries).toHaveBeenCalledTimes(1)
    expect(client.createEntry).not.toHaveBeenCalled()
    expect(client.updateEntry).not.toHaveBeenCalled()
  })

  it('月を切り替えると入力順に戻る', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue(sortData())

    const { rerender } = render(<EntryTab month="2026-09" currentMonth="2026-09" />)
    fireEvent.change(await screen.findByLabelText('並べ替え'), { target: { value: 'amountAsc' } })

    rerender(<EntryTab month="2026-08" currentMonth="2026-09" />)

    await waitFor(() => expect(screen.getByLabelText('並べ替え')).toHaveValue('input'))
  })

  it('変動費以外のタブには並べ替えが出ない', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig({ categories: { 変動費: ['食費'], 収入: ['夫給与'], 車: ['車整備'] } }))
    vi.mocked(client.getEntries).mockResolvedValue(sortData())

    render(<EntryTab month="2026-09" currentMonth="2026-09" />)
    expect(await screen.findByLabelText('並べ替え')).toBeInTheDocument()

    for (const tab of ['収入', '車']) {
      fireEvent.click(screen.getByRole('button', { name: tab }))
      await screen.findByRole('table')
      expect(screen.queryByLabelText('並べ替え')).toBeNull()
    }
  })

  it('データが無いときは並べ替えを出さない', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())

    render(<EntryTab month="2026-09" currentMonth="2026-09" />)

    await screen.findByText('まだデータがありません。')
    expect(screen.queryByLabelText('並べ替え')).toBeNull()
  })
})

describe('EntryTab - 変動費カテゴリの初期値', () => {
  it('並び順で「不明」が先頭でも、初期値は「食費」になる', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(
      baseConfig({ categories: { 変動費: ['不明', '交通費', '食費', '消耗品'], 収入: ['夫給与'] } }),
    )

    render(<EntryTab month="2026-07" />)

    const select = await screen.findByLabelText('カテゴリ')
    await waitFor(() => expect(select).toHaveValue('食費'))
  })

  it('「食費」が無ければ先頭のカテゴリになる', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig({ categories: { 変動費: ['消耗品', '交際費'] } }))

    render(<EntryTab month="2026-07" />)

    const select = await screen.findByLabelText('カテゴリ')
    await waitFor(() => expect(select).toHaveValue('消耗品'))
  })
})

describe('EntryTab - 日の入力', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('今月のシートでは日の初期値が今日（JST）になり、createEntry に渡る', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T03:00:00Z')) // JST 9/28 12:00
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.createEntry).mockResolvedValue([])

    render(<EntryTab month="2026-09" currentMonth="2026-09" />)

    const daySelect = await screen.findByLabelText('日（9月）')
    expect(daySelect).toHaveValue('28')
    // 9月は30日まで
    expect(within(daySelect).getByRole('option', { name: '30日' })).toBeInTheDocument()
    expect(within(daySelect).queryByRole('option', { name: '31日' })).toBeNull()

    fireEvent.change(await screen.findByPlaceholderText('例: 3000'), { target: { value: '800' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(client.createEntry).toHaveBeenCalledWith('2026-09', '食費', 800, '', 28))
  })

  it('日は変更でき、追加後も選んだ日が残る', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.createEntry).mockResolvedValue([])

    render(<EntryTab month="2026-09" currentMonth="2026-09" />)

    const daySelect = await screen.findByLabelText('日（9月）')
    fireEvent.change(daySelect, { target: { value: '3' } })
    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '800' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => expect(client.createEntry).toHaveBeenCalledWith('2026-09', '食費', 800, '', 3))
    await waitFor(() => expect(screen.getByPlaceholderText('例: 3000')).toHaveValue(null))
    expect(screen.getByLabelText('日（9月）')).toHaveValue('3')
  })

  it('今月以外のシートでは日の初期値は空欄', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())

    render(<EntryTab month="2026-08" currentMonth="2026-09" />)

    expect(await screen.findByLabelText('日（8月）')).toHaveValue('')
  })

  it('車・バイク・投資のタブにも日の入力があり、収入タブには無い', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(
      baseConfig({
        categories: { 変動費: ['食費'], 収入: ['夫給与'], 車: ['ガソリン(車)'], バイク: ['ガソリン(バイク)'], 投資: ['NISA'] },
      }),
    )

    render(<EntryTab month="2026-09" currentMonth="2026-09" />)

    for (const tab of ['車', 'バイク', '投資']) {
      fireEvent.click(await screen.findByRole('button', { name: tab }))
      expect(await screen.findByLabelText('日（9月）')).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: '収入' }))
    await screen.findByText('まだデータがありません。')
    expect(screen.queryByLabelText('日（9月）')).toBeNull()
  })

  it('一覧に日付が表示され、変動費の既定は入力順（新しく入力したものが上）', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-09', カテゴリ: '食費', 金額: 100, 備考: '', 日: 10 },
      { id: 2, 年月: '2026-09', カテゴリ: '食費', 金額: 200, 備考: '', 日: null },
      { id: 3, 年月: '2026-09', カテゴリ: '食費', 金額: 300, 備考: '', 日: 25 },
      { id: 4, 年月: '2026-09', カテゴリ: '食費', 金額: 400, 備考: '', 日: 10 },
    ])

    render(<EntryTab month="2026-09" currentMonth="2026-09" />)

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/9\/10.*400/),
      expect.stringMatching(/9\/25.*300/),
      expect.stringContaining('200'),
      expect.stringMatching(/9\/10.*100/),
    ])
  })

  it('車タブは日付の古い順（日付なしは末尾）', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig({ categories: { 変動費: ['食費'], 車: ['車整備'] } }))
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-09', カテゴリ: '車整備', 金額: 100, 備考: '', 日: null },
      { id: 2, 年月: '2026-09', カテゴリ: '車整備', 金額: 200, 備考: '', 日: 20 },
      { id: 3, 年月: '2026-09', カテゴリ: '車整備', 金額: 300, 備考: '', 日: 5 },
    ])

    render(<EntryTab month="2026-09" currentMonth="2026-09" />)
    fireEvent.click(await screen.findByRole('button', { name: '車' }))

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('9/5'),
      expect.stringContaining('9/20'),
      expect.stringContaining('100'),
    ])
  })

  it('編集で日を変更・クリアできる', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 7, 年月: '2026-09', カテゴリ: '食費', 金額: 1000, 備考: '', 日: 12 },
    ])
    vi.mocked(client.updateEntry).mockResolvedValue([])

    render(<EntryTab month="2026-09" currentMonth="2026-09" />)

    fireEvent.click(await screen.findByRole('button', { name: '編集' }))
    const editRow = screen.getByRole('button', { name: '保存' }).closest('tr')!
    const daySelect = within(editRow).getByLabelText('日')
    expect(daySelect).toHaveValue('12')
    fireEvent.change(daySelect, { target: { value: '' } })
    fireEvent.click(within(editRow).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(client.updateEntry).toHaveBeenCalledWith(7, 1000, '食費', '', null))
  })
})

describe('EntryTab - 合計表示', () => {
  it('固定費タブで合計と件数が表示される', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig({ categories: { 変動費: ['食費'], 固定費: ['家賃', '保険'] } }))
    vi.mocked(client.getEntries).mockResolvedValue([
      { id: 1, 年月: '2026-09', カテゴリ: '家賃', 金額: 84700, 備考: '' },
      { id: 2, 年月: '2026-09', カテゴリ: '保険', 金額: 5300, 備考: '' },
    ])

    render(<EntryTab month="2026-09" />)
    fireEvent.click(await screen.findByRole('button', { name: '固定費' }))

    expect(await screen.findByTestId('group-total')).toHaveTextContent('合計￥90,000（2件）')
  })

  it.each(['インフラ', '車', 'バイク'])('%s タブでも合計が表示される', async (tab) => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())

    render(<EntryTab month="2026-09" />)
    fireEvent.click(await screen.findByRole('button', { name: tab }))

    expect(await screen.findByTestId('group-total')).toHaveTextContent('合計￥0（0件）')
  })

  it.each(['サブスク', '通信費'])('%s タブで合計が表示される', async (tab) => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getBundleItems).mockResolvedValue([
      { id: 1, 年月: '2026-09', 名前: 'A', 金額: 1490 },
      { id: 2, 年月: '2026-09', 名前: 'B', 金額: 980 },
    ])

    render(<EntryTab month="2026-09" />)
    fireEvent.click(await screen.findByRole('button', { name: tab }))

    expect(await screen.findByTestId('group-total')).toHaveTextContent('合計￥2,470（2件）')
  })

  it('変動費・収入タブには合計を出さない', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())

    render(<EntryTab month="2026-09" />)
    await screen.findByText('まだデータがありません。')
    expect(screen.queryByTestId('group-total')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '収入' }))
    await screen.findByText('まだデータがありません。')
    expect(screen.queryByTestId('group-total')).toBeNull()
  })
})

describe('EntryTab - スマホで追加フォームを中央にパッと表示', () => {
  const scrollSpy = vi.fn()
  const originalScrollIntoView = Element.prototype.scrollIntoView
  const originalMatchMedia = window.matchMedia

  const stubViewport = (mobile: boolean) => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
  }

  beforeEach(() => {
    scrollSpy.mockReset()
    Element.prototype.scrollIntoView = scrollSpy
  })

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView
    window.matchMedia = originalMatchMedia
  })

  it('スマホ幅では開いた直後に追加フォームを中央へ（アニメーションなし）', async () => {
    stubViewport(true)
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())

    render(<EntryTab month="2026-07" />)

    await screen.findByText('まだデータがありません。')
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' })
    const target = scrollSpy.mock.contexts.at(-1) as HTMLElement
    expect(within(target).getByLabelText('カテゴリ')).toBeInTheDocument()
  })

  it('読み込み中でも追加フォームが表示されている', async () => {
    stubViewport(true)
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockReturnValue(new Promise(() => {}))

    render(<EntryTab month="2026-07" />)

    expect(await screen.findByText('読み込み中...')).toBeInTheDocument()
    expect(screen.getByLabelText('カテゴリ')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('例: 3000')).toBeInTheDocument()
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('サブタブ（収入・通信費）を押すとそのタブのフォームを中央へ', async () => {
    stubViewport(true)
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())

    render(<EntryTab month="2026-07" />)
    await screen.findByText('まだデータがありません。')

    for (const tab of ['収入', '通信費']) {
      scrollSpy.mockClear()
      fireEvent.click(screen.getByRole('button', { name: tab }))
      await screen.findByText('まだデータがありません。')
      expect(scrollSpy).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' })
    }
    const target = scrollSpy.mock.contexts.at(-1) as HTMLElement
    expect(within(target).getByPlaceholderText('例: 自分のスマホ')).toBeInTheDocument()
  })

  it('追加後の再読込ではスクロールしない', async () => {
    stubViewport(true)
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.createEntry).mockResolvedValue([])

    render(<EntryTab month="2026-07" />)
    await screen.findByText('まだデータがありません。')
    await waitFor(() => expect(screen.getByRole('button', { name: '追加' })).not.toBeDisabled())
    scrollSpy.mockClear()

    fireEvent.change(screen.getByPlaceholderText('例: 3000'), { target: { value: '800' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(client.createEntry).toHaveBeenCalled())
    await waitFor(() => expect(client.getEntries).toHaveBeenCalledTimes(2))

    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('PC幅ではスクロールしない', async () => {
    stubViewport(false)
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())

    render(<EntryTab month="2026-07" />)
    await screen.findByText('まだデータがありません。')
    fireEvent.click(screen.getByRole('button', { name: '収入' }))
    await screen.findByText('まだデータがありません。')

    expect(scrollSpy).not.toHaveBeenCalled()
  })
})

describe('EntryTab - 古い読み込み結果を無視する', () => {
  it('タブを素早く切り替えて前のタブの結果が後から届いても、今のタブの一覧が上書きされない', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    let resolveVariable: (v: Awaited<ReturnType<typeof client.getEntries>>) => void = () => {}
    vi.mocked(client.getEntries).mockImplementation((_month, group) =>
      group === '変動費'
        ? new Promise((r) => { resolveVariable = r })
        : Promise.resolve([{ id: 9, 年月: '2026-07', カテゴリ: '夫給与', 金額: 300000, 備考: '' }]),
    )

    render(<EntryTab month="2026-07" />)
    fireEvent.click(await screen.findByRole('button', { name: '収入' }))
    expect(await screen.findByText('￥300,000')).toBeInTheDocument()

    resolveVariable([{ id: 1, 年月: '2026-07', カテゴリ: '食費', 金額: 777, 備考: '' }])
    await new Promise((r) => setTimeout(r, 0))

    expect(screen.getByText('￥300,000')).toBeInTheDocument()
    expect(screen.queryByText('￥777')).toBeNull()
  })
})

describe('EntryTab - 割り勘アプリへの反映', () => {
  const foodEntry = { id: 1, 年月: '2026-07', カテゴリ: '食費', 金額: 3500, 備考: '食材', 日: 5 }

  function enableWarikan() {
    vi.mocked(client.getWarikanStatus).mockResolvedValue({ enabled: true })
    vi.mocked(client.getWarikanUsers).mockResolvedValue([
      { user_id: 'u-takuma', display_name: 'たくま' },
      { user_id: 'u-kana', display_name: 'かな' },
    ])
  }

  it('連携が無効なら反映ボタンは出ない（連携前と同じ画面）', async () => {
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([foodEntry])

    render(<EntryTab month="2026-07" />)
    await screen.findByRole('button', { name: '編集' })

    expect(screen.queryByRole('button', { name: '反映' })).not.toBeInTheDocument()
  })

  it('連携が有効で日付がある行には反映ボタンが出る', async () => {
    enableWarikan()
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([foodEntry])

    render(<EntryTab month="2026-07" />)

    expect(await screen.findByRole('button', { name: '反映' })).toBeEnabled()
  })

  it('日付が未入力の行では反映ボタンを押せない', async () => {
    enableWarikan()
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([{ ...foodEntry, 日: null }])

    render(<EntryTab month="2026-07" />)

    expect(await screen.findByRole('button', { name: '反映' })).toBeDisabled()
  })

  it('日付を入力しないタブ（固定費）では反映ボタンを出さない', async () => {
    enableWarikan()
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig({ categories: { 変動費: ['食費'], 固定費: ['家賃'] } }))
    vi.mocked(client.getEntries).mockResolvedValue([{ id: 2, 年月: '2026-07', カテゴリ: '家賃', 金額: 80000, 備考: '' }])

    render(<EntryTab month="2026-07" />)
    fireEvent.click(await screen.findByRole('button', { name: '固定費' }))
    await screen.findByRole('button', { name: '編集' })

    expect(screen.queryByRole('button', { name: '反映' })).not.toBeInTheDocument()
  })

  it('反映ボタンでダイアログが開き、反映内容を確認できる', async () => {
    enableWarikan()
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([foodEntry])

    render(<EntryTab month="2026-07" />)
    fireEvent.click(await screen.findByRole('button', { name: '反映' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('7/5')).toBeInTheDocument()
    expect(within(dialog).getByText('食材')).toBeInTheDocument()
    expect(await within(dialog).findByRole('radio', { name: 'たくま' })).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'かな' })).toBeInTheDocument()
  })

  it('支払者を選ばずに反映しようとしても送信しない', async () => {
    enableWarikan()
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([foodEntry])

    render(<EntryTab month="2026-07" />)
    fireEvent.click(await screen.findByRole('button', { name: '反映' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('radio', { name: 'かな' })

    expect(within(dialog).getByRole('button', { name: '反映する' })).toBeDisabled()
    expect(client.reflectToWarikan).not.toHaveBeenCalled()
  })

  it('支払者を選んで反映すると、選んだユーザーIDで送信され一覧が反映済みになる', async () => {
    enableWarikan()
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    // 反映後は一覧を取り直す（反映APIの戻り値は全グループ・全月なので使わない）。
    vi.mocked(client.getEntries)
      .mockResolvedValueOnce([foodEntry])
      .mockResolvedValue([{ ...foodEntry, 割り勘ID: 'exp-1' }])
    vi.mocked(client.reflectToWarikan).mockResolvedValue([{ ...foodEntry, 割り勘ID: 'exp-1' }])

    render(<EntryTab month="2026-07" />)
    fireEvent.click(await screen.findByRole('button', { name: '反映' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'かな' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '反映する' }))

    await waitFor(() => expect(client.reflectToWarikan).toHaveBeenCalledWith(1, 'u-kana'))
    expect(await screen.findByText('反映済み')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // 絞り込み条件つきで取り直していること（全件で一覧を上書きしない）。
    expect(client.getEntries).toHaveBeenLastCalledWith('2026-07', '変動費')
  })

  it('反映に失敗したらダイアログ内にエラーを出し、一覧は変えない', async () => {
    enableWarikan()
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([foodEntry])
    vi.mocked(client.reflectToWarikan).mockRejectedValue(new Error('割り勘アプリに接続できませんでした'))

    render(<EntryTab month="2026-07" />)
    fireEvent.click(await screen.findByRole('button', { name: '反映' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'かな' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '反映する' }))

    expect(await within(dialog).findByText('割り勘アプリに接続できませんでした')).toBeInTheDocument()
    expect(screen.queryByText('反映済み')).not.toBeInTheDocument()
  })

  it('反映済みの行は「反映済み」と「取消」が出て、削除は押せない', async () => {
    enableWarikan()
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries).mockResolvedValue([{ ...foodEntry, 割り勘ID: 'exp-1' }])

    render(<EntryTab month="2026-07" />)

    expect(await screen.findByText('反映済み')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '削除' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '反映' })).not.toBeInTheDocument()
  })

  it('取消を押すと反映が取り消され、再び反映できる状態に戻る', async () => {
    enableWarikan()
    vi.mocked(client.getConfig).mockResolvedValue(baseConfig())
    vi.mocked(client.getEntries)
      .mockResolvedValueOnce([{ ...foodEntry, 割り勘ID: 'exp-1' }])
      .mockResolvedValue([{ ...foodEntry, 割り勘ID: null }])
    vi.mocked(client.cancelWarikanReflect).mockResolvedValue([{ ...foodEntry, 割り勘ID: null }])

    render(<EntryTab month="2026-07" />)
    fireEvent.click(await screen.findByRole('button', { name: '取消' }))

    await waitFor(() => expect(client.cancelWarikanReflect).toHaveBeenCalledWith(1))
    expect(await screen.findByRole('button', { name: '反映' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '削除' })).toBeEnabled()
    expect(client.getEntries).toHaveBeenLastCalledWith('2026-07', '変動費')
  })
})
