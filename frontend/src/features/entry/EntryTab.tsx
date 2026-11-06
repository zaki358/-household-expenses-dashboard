import { useEffect, useRef, useState } from 'react'
import {
  cancelWarikanReflect,
  createBundleItem,
  createEntry,
  deleteBundleItem,
  deleteEntry,
  getBundleItems,
  getConfig,
  getEntries,
  getWarikanStatus,
  updateBundleItem,
  updateEntry,
} from '../../api/client'
import type { ConfigOut, IndexedBundleItem, IndexedEntry } from '../../api/types'
import { Button } from '../../components/Button'
import { SectionTitle } from '../../components/SectionTitle'
import { TextInput } from '../../components/TextInput'
import { formatYen } from '../../utils/currency'
import { jstDayOfMonth, jstMonth, monthNumber } from '../../utils/dates'
import {
  darkSelectClass,
  DaySelect,
  dayFromSelect,
  dayToSelect,
  formatEntryDate,
  type EntrySortKey,
  GroupTotal,
  sortEntries,
  sortEntriesByDay,
  SortSelect,
} from './entryParts'
import { useFormAutoScroll } from './useFormAutoScroll'
import { WarikanDialog } from './WarikanDialog'

type SubTab = '変動費' | '収入' | '固定費' | 'インフラ' | '通信費' | 'サブスク' | '車' | 'バイク' | '投資'

// 変動費を先頭（＝入力画面を開いた直後の初期タブ）に。最も入力頻度が高いため。
const SUB_TABS: SubTab[] = ['変動費', '収入', '固定費', 'インフラ', '通信費', 'サブスク', '車', 'バイク', '投資']

// 行がどんどん増えるのは実質 変動費 だけ。ここだけ「フォームが上・新しい順」にして、
// 追加のたびに一覧の下までスクロールしなくて済むようにする。
const QUICK_ENTRY_TABS: SubTab[] = ['変動費']

// 「日」を任意入力できるタブ（月はシートで決まるので日だけ）。
const DAY_TABS: SubTab[] = ['変動費', '車', 'バイク', '投資']

// 割り勘アプリへの反映ボタンを出すタブ。割り勘は日付必須なので「日」を入力できるタブに限る。
// 家賃・給与・サブスクなど割り勘に出さないものは対象外。
const WARIKAN_TABS: SubTab[] = ['変動費', '車', 'バイク', '投資']

// タブ内の合計を表示するタブ（通信費・サブスクは BundlePanel 側で常に表示）。
const TOTAL_TABS: SubTab[] = ['固定費', 'インフラ', '車', 'バイク']

// 一覧の並べ替え（入力順・金額順・日付順）を選べるタブ。
const SORTABLE_TABS: SubTab[] = ['変動費']

// カテゴリの初期値。DBの並び順（sort_order→名前順）では「不明」が先頭に来てしまうため、
// 最もよく使うカテゴリを明示する。一覧に無ければ先頭にフォールバック。
const DEFAULT_CATEGORY: Partial<Record<SubTab, string>> = {
  変動費: '食費',
}

const BUNDLE_KIND: Partial<Record<SubTab, string>> = {
  通信費: 'communications',
  サブスク: 'subscriptions',
}

const HELP_TEXT: Record<SubTab, string> = {
  変動費: '食費・消耗品・交際費など毎月変わる支出。カテゴリを選んで金額を入力（最もよく使う項目）。',
  収入: '給与・ボーナスなどの収入を記録します（毎月入力）。',
  固定費: '家賃・保険などの固定費（翌月作成時に引き継ぎ。サブスクは別タブ）。',
  インフラ: '電気・ガス・水道など毎月変動する費用（毎月入力・引き継ぎなし）。',
  通信費: 'スマホ・プロバイダ等を項目ごとに入力。集計は「通信費」としてまとめられます。',
  サブスク: 'サブスクを項目ごとに入力。集計は「サブスク」として固定費に計上されます。',
  車: 'ガソリン・車検・車税金・整備など車関連の費用。',
  バイク: 'ガソリン・バイク保険・整備などバイク関連の費用。',
  投資: 'NISA・投資信託などの投資額（毎月入力）。',
}

interface EntryGroupPanelProps {
  month: string
  group: string
  categories: string[]
  // 追加フォームを一覧の上に出すか（変動費タブ用）。既定は false ＝一覧が上・フォームが下。
  formOnTop?: boolean
  // 一覧を新しい順（id降順）で出すか。表示だけの並び替えで、DB・集計・CSVには影響しない。
  newestFirst?: boolean
  // カテゴリの初期値（一覧に無ければ先頭）。
  defaultCategory?: string
  // 「日」の入力欄を出すか。出す場合、一覧は日付順（日付なしは末尾）に並ぶ。
  showDay?: boolean
  // 追加フォームの「日」の初期値（'' = 日付なし）。
  defaultDay?: string
  // 一覧の上にタブ内の合計を出すか。
  showTotal?: boolean
  // 一覧の上に並べ替えセレクトを出すか。選択はこの画面の状態だけ（保存しない・相手の画面に影響しない）。
  sortable?: boolean
  // 値が変わるたびに（スマホ幅なら）追加フォームを画面中央へ移す。
  scrollRequest?: number
  // 各行に「割り勘に反映」ボタンを出すか。連携が無効なら false で、連携前と同じ見た目になる。
  showWarikan?: boolean
}

function EntryGroupPanel({
  month,
  group,
  categories,
  formOnTop = false,
  newestFirst = false,
  defaultCategory,
  showDay = false,
  defaultDay = '',
  showTotal = false,
  sortable = false,
  scrollRequest = 0,
  showWarikan = false,
}: EntryGroupPanelProps) {
  const [entries, setEntries] = useState<IndexedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [day, setDay] = useState(defaultDay)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<EntrySortKey>('input')
  const formRef = useRef<HTMLDivElement>(null)
  useFormAutoScroll(formRef, scrollRequest, loading)

  // 編集中の行（同時に1行のみ）。ドラフト値は編集開始時に該当行からコピーする。
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editCategory, setEditCategory] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editDay, setEditDay] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // 割り勘への反映ダイアログの対象行（null = 閉じている）。
  const [warikanTarget, setWarikanTarget] = useState<IndexedEntry | null>(null)
  const [warikanBusyId, setWarikanBusyId] = useState<number | null>(null)

  // カテゴリ一覧(config)は entries と並行して読み込まれるため、到着前は空になりうる。
  // 選択値を state だけで持つと「selectの見た目は先頭項目・実値は空文字」になるので、
  // 未選択なら先頭を使う導出値を選択値として扱う。
  const preferredCategory = defaultCategory && categories.includes(defaultCategory) ? defaultCategory : categories[0]
  const selectedCategory = category || preferredCategory || ''
  const categoriesReady = categories.length > 0

  // showLoading=false で呼ぶと、編集・追加の直後でもテーブルが一瞬「読み込み中...」に
  // 差し替わらない（初回マウント時だけ true にする）。
  // 読み込みに連番を付け、最新の読み込み結果だけを反映する。タブの素早い切り替えや
  // 初回読み込み中の追加で、古い結果が後から届いて一覧を上書きするのを防ぐ。
  const requestSeq = useRef(0)
  const refresh = (showLoading = true) => {
    const seq = ++requestSeq.current
    const isLatest = () => seq === requestSeq.current
    if (showLoading) setLoading(true)
    setError(null)
    getEntries(month, group)
      .then((data) => { if (isLatest()) setEntries(data) })
      .catch((e: unknown) => { if (isLatest()) setError(e instanceof Error ? e.message : 'エラーが発生しました') })
      .finally(() => { if (isLatest()) setLoading(false) })
  }

  useEffect(() => {
    setCategory('')
    setAmount('')
    setNote('')
    setDay(defaultDay)
    setFormError(null)
    setEditingId(null)
    setSortKey('input')
    refresh()
  }, [month, group])

  const handleAdd = async () => {
    const amountNum = parseInt(amount, 10)
    if (!selectedCategory) { setFormError('カテゴリを選択してください'); return }
    if (isNaN(amountNum) || amountNum <= 0) { setFormError('金額は1以上の整数を入力してください'); return }
    setSubmitting(true)
    setFormError(null)
    try {
      // 日は日付タブでだけ送る。追加後も日は残す（同じ日の買い物を続けて入れやすくするため）。
      if (showDay) await createEntry(month, selectedCategory, amountNum, note, dayFromSelect(day))
      else await createEntry(month, selectedCategory, amountNum, note)
      setAmount('')
      setNote('')
      refresh(false)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteEntry(id)
      refresh(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  // 反映の取り消し。割り勘側の支出を消して、この行を未反映に戻す。
  const handleCancelWarikan = async (id: number) => {
    setWarikanBusyId(id)
    setError(null)
    try {
      // 戻り値は全グループ・全月の一覧なので使わず、絞り込み条件付きで取り直す
      // （追加・編集・削除と同じ作法）。
      await cancelWarikanReflect(id)
      refresh(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '反映の取り消しに失敗しました')
    } finally {
      setWarikanBusyId(null)
    }
  }

  const startEdit = (e: IndexedEntry) => {
    setEditingId(e.id)
    setEditCategory(e.カテゴリ)
    setEditAmount(String(e.金額))
    setEditNote(e.備考)
    setEditDay(dayToSelect(e.日))
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (editingId === null) return
    const amountNum = parseInt(editAmount, 10)
    if (isNaN(amountNum) || amountNum <= 0) { setEditError('金額は1以上の整数を入力してください'); return }
    setEditSubmitting(true)
    setEditError(null)
    try {
      if (showDay) await updateEntry(editingId, amountNum, editCategory, editNote, dayFromSelect(editDay))
      else await updateEntry(editingId, amountNum, editCategory, editNote)
      setEditingId(null)
      refresh(false)
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : '更新に失敗しました')
    } finally {
      setEditSubmitting(false)
    }
  }

  // 表示順だけを変える。DBの並び・集計・CSVには影響しない。
  const visibleEntries = sortable
    ? sortEntries(entries, sortKey)
    : showDay
      ? sortEntriesByDay(entries, newestFirst)
      : newestFirst ? [...entries].reverse() : entries

  // 読み込み中・エラーは一覧部分だけに出し、追加フォームは常に表示する（スマホで即入力できるように）。
  const listReady = !loading && !error
  const list = loading ? (
        <p className="font-body text-[13px] text-mute-dark">読み込み中...</p>
  ) : error ? (
        <p className="font-body text-[13px] text-warning">{error}</p>
  ) : entries.length > 0 ? (
        <table className="w-full text-left font-body text-[13px] leading-[1.6]">
          <thead>
            <tr className="border-b border-hairline-dark">
              <th className="py-xs font-medium text-mute-dark">カテゴリ</th>
              <th className="py-xs font-medium text-mute-dark">金額</th>
              <th className="py-xs" />
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map((e) =>
              editingId === e.id ? (
                <tr key={e.id} className="border-b border-hairline-dark text-on-dark">
                  <td colSpan={3} className="py-sm">
                    <div className="flex flex-wrap gap-sm items-end">
                      <div className="flex flex-col gap-xxs">
                        <label className="font-body text-[13px] leading-[1.8] text-mute-dark" htmlFor={`edit-cat-${e.id}`}>
                          カテゴリ
                        </label>
                        <select
                          id={`edit-cat-${e.id}`}
                          value={editCategory}
                          onChange={(ev) => setEditCategory(ev.target.value)}
                          className={darkSelectClass}
                        >
                          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      {showDay && (
                        <DaySelect id={`edit-day-${e.id}`} label="日" month={month} value={editDay} onChange={setEditDay} />
                      )}
                      <TextInput id={`edit-amount-${e.id}`} label="金額（円）" type="number" inputMode="numeric" min={1} value={editAmount}
                        onChange={(ev) => setEditAmount(ev.target.value)} className="w-36" />
                      <TextInput id={`edit-note-${e.id}`} label="詳細（任意）" value={editNote}
                        onChange={(ev) => setEditNote(ev.target.value)} placeholder="例: 洗剤" className="w-44" />
                      <Button size="sm" variant={editSubmitting ? 'disabled' : 'primary'} onClick={handleSaveEdit}>
                        保存
                      </Button>
                      <Button size="sm" variant="secondary" onClick={cancelEdit}>キャンセル</Button>
                    </div>
                    {editError && <p className="mt-xs font-body text-[13px] text-warning">{editError}</p>}
                  </td>
                </tr>
              ) : (
                <tr key={e.id} className="border-b border-hairline-dark text-on-dark">
                  <td className="py-xs align-top">
                    <div>
                      {showDay && formatEntryDate(month, e.日) && (
                        <span className="mr-xs text-mute-dark tabular-nums">{formatEntryDate(month, e.日)}</span>
                      )}
                      {e.カテゴリ}
                    </div>
                    {e.備考 && <div className="mt-0.5 font-body text-[12px] leading-[1.5] text-mute-dark">{e.備考}</div>}
                  </td>
                  <td className="py-xs align-top">{formatYen(e.金額)}</td>
                  <td className="py-xs align-top text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startEdit(e)}
                      disabled={!categoriesReady}
                      className="font-body text-[12px] text-on-dark-mute hover:text-on-dark mr-sm disabled:opacity-40 disabled:hover:text-on-dark-mute"
                    >
                      編集
                    </button>
                    {showWarikan &&
                      (e.割り勘ID ? (
                        <>
                          <span className="font-body text-[12px] text-link-dark mr-sm">反映済み</span>
                          <button
                            type="button"
                            onClick={() => handleCancelWarikan(e.id)}
                            disabled={warikanBusyId === e.id}
                            aria-label="取消"
                            title="割り勘アプリ側の支出を削除して未反映に戻す"
                            className="font-body text-[12px] text-on-dark-mute hover:text-on-dark mr-sm disabled:opacity-40 disabled:hover:text-on-dark-mute"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setWarikanTarget(e)}
                          disabled={e.日 == null}
                          aria-label="反映"
                          title={e.日 == null ? '日付を入力すると割り勘に反映できます' : '割り勘アプリに反映する'}
                          className="font-body text-[12px] text-link-dark hover:opacity-70 mr-sm disabled:opacity-40 disabled:hover:opacity-100"
                        >
                          反映
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      disabled={showWarikan && e.割り勘ID != null}
                      aria-label="削除"
                      title={
                        showWarikan && e.割り勘ID != null
                          ? '先に割り勘への反映を取り消してください'
                          : undefined
                      }
                      className="font-body text-[12px] text-warning hover:opacity-70 disabled:opacity-40 disabled:hover:opacity-40"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
  ) : (
        <p className="font-body text-[13px] text-mute-dark">まだデータがありません。</p>
  )

  const addForm = (
      <div ref={formRef}>
        <SectionTitle level="heading-md" className="text-on-dark">追加</SectionTitle>
        <div className="mt-sm flex flex-wrap gap-sm items-end">
          <div className="flex flex-col gap-xxs">
            <label className="font-body text-[13px] leading-[1.8] text-mute-dark" htmlFor={`cat-${group}`}>
              カテゴリ
            </label>
            <select
              id={`cat-${group}`}
              value={selectedCategory}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!categoriesReady}
              className={darkSelectClass}
            >
              {categoriesReady
                ? categories.map((c) => <option key={c} value={c}>{c}</option>)
                : <option value="">読み込み中...</option>}
            </select>
          </div>
          {showDay && (
            <DaySelect id={`day-${group}`} label={`日（${monthNumber(month)}月）`} month={month} value={day} onChange={setDay} />
          )}
          <TextInput label="金額（円）" type="number" inputMode="numeric" min={1} value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="例: 3000" className="w-36" />
          <TextInput label="詳細（任意）" value={note}
            onChange={(e) => setNote(e.target.value)} placeholder="例: 洗剤" className="w-44" />
          <Button
            size="sm"
            variant={submitting || !categoriesReady ? 'disabled' : 'primary'}
            onClick={handleAdd}
          >
            追加
          </Button>
        </div>
        {formError && <p className="mt-xs font-body text-[13px] text-warning">{formError}</p>}
      </div>
  )

  const listWithTotal = (
    <>
      {showTotal && listReady && <GroupTotal amounts={entries.map((e) => e.金額)} />}
      {sortable && listReady && entries.length > 0 && <SortSelect id={`sort-${group}`} value={sortKey} onChange={setSortKey} />}
      {list}
    </>
  )

  const warikanDialog =
    warikanTarget !== null ? (
      <WarikanDialog
        month={month}
        entry={warikanTarget}
        onClose={() => setWarikanTarget(null)}
        onDone={() => {
          setWarikanTarget(null)
          refresh(false)
        }}
      />
    ) : null

  return formOnTop ? (
    <div>
      {addForm}
      <div className="mt-lg">{listWithTotal}</div>
      {warikanDialog}
    </div>
  ) : (
    <div>
      {listWithTotal}
      <div className="mt-lg">{addForm}</div>
      {warikanDialog}
    </div>
  )
}

interface BundlePanelProps {
  month: string
  kind: string
  // 値が変わるたびに（スマホ幅なら）追加フォームを画面中央へ移す。
  scrollRequest?: number
}

function BundlePanel({ month, kind, scrollRequest = 0 }: BundlePanelProps) {
  const [items, setItems] = useState<IndexedBundleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  useFormAutoScroll(formRef, scrollRequest, loading)

  // 読み込みに連番を付け、最新の読み込み結果だけを反映する。タブの素早い切り替えや
  // 初回読み込み中の追加で、古い結果が後から届いて一覧を上書きするのを防ぐ。
  const requestSeq = useRef(0)
  const refresh = (showLoading = true) => {
    const seq = ++requestSeq.current
    const isLatest = () => seq === requestSeq.current
    if (showLoading) setLoading(true)
    setError(null)
    getBundleItems(kind, month)
      .then((data) => { if (isLatest()) setItems(data) })
      .catch((e: unknown) => { if (isLatest()) setError(e instanceof Error ? e.message : 'エラーが発生しました') })
      .finally(() => { if (isLatest()) setLoading(false) })
  }

  useEffect(() => {
    setName('')
    setAmount('')
    setFormError(null)
    setEditingId(null)
    refresh()
  }, [month, kind])

  const handleAdd = async () => {
    if (!name.trim()) { setFormError('項目名を入力してください'); return }
    const amountNum = parseInt(amount, 10)
    if (isNaN(amountNum) || amountNum <= 0) { setFormError('金額は1以上の整数を入力してください'); return }
    setSubmitting(true)
    setFormError(null)
    try {
      await createBundleItem(kind, month, name.trim(), amountNum)
      setName('')
      setAmount('')
      refresh(false)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteBundleItem(kind, id)
      refresh(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  const startEdit = (item: IndexedBundleItem) => {
    setEditingId(item.id)
    setEditName(item.名前)
    setEditAmount(String(item.金額))
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (editingId === null) return
    if (!editName.trim()) { setEditError('項目名を入力してください'); return }
    const amountNum = parseInt(editAmount, 10)
    if (isNaN(amountNum) || amountNum <= 0) { setEditError('金額は1以上の整数を入力してください'); return }
    setEditSubmitting(true)
    setEditError(null)
    try {
      await updateBundleItem(kind, editingId, amountNum, editName.trim())
      setEditingId(null)
      refresh(false)
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : '更新に失敗しました')
    } finally {
      setEditSubmitting(false)
    }
  }

  // 読み込み中・エラーは一覧部分だけに出し、追加フォームは常に表示する（スマホで即入力できるように）。
  return (
    <div>
      {loading ? (
        <p className="font-body text-[13px] text-mute-dark">読み込み中...</p>
      ) : error ? (
        <p className="font-body text-[13px] text-warning">{error}</p>
      ) : (
          <>
            <GroupTotal amounts={items.map((i) => i.金額)} />
            {items.length > 0 ? (
              <table className="w-full text-left font-body text-[13px] leading-[1.6]">
                <thead>
                  <tr className="border-b border-hairline-dark">
                    <th className="py-xs font-medium text-mute-dark">名前</th>
                    <th className="py-xs font-medium text-mute-dark">金額</th>
                    <th className="py-xs" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) =>
                    editingId === item.id ? (
                      <tr key={item.id} className="border-b border-hairline-dark text-on-dark">
                        <td colSpan={3} className="py-sm">
                          <div className="flex flex-wrap gap-sm items-end">
                            <TextInput label="項目名" value={editName} onChange={(ev) => setEditName(ev.target.value)}
                              className="w-44" />
                            <TextInput label="金額（円）" type="number" inputMode="numeric" min={1} value={editAmount}
                              onChange={(ev) => setEditAmount(ev.target.value)} className="w-32" />
                            <Button size="sm" variant={editSubmitting ? 'disabled' : 'primary'} onClick={handleSaveEdit}>
                              保存
                            </Button>
                            <Button size="sm" variant="secondary" onClick={cancelEdit}>キャンセル</Button>
                          </div>
                          {editError && <p className="mt-xs font-body text-[13px] text-warning">{editError}</p>}
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} className="border-b border-hairline-dark text-on-dark">
                        <td className="py-xs">{item.名前}</td>
                        <td className="py-xs">{formatYen(item.金額)}</td>
                        <td className="py-xs text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="font-body text-[12px] text-on-dark-mute hover:text-on-dark mr-sm"
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="font-body text-[12px] text-warning hover:opacity-70"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            ) : (
              <p className="font-body text-[13px] text-mute-dark">まだデータがありません。</p>
            )}
          </>
      )}

      <div className="mt-lg" ref={formRef}>
        <SectionTitle level="heading-md" className="text-on-dark">追加</SectionTitle>
        <div className="mt-sm flex flex-wrap gap-sm items-end">
          <TextInput label="項目名" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="例: 自分のスマホ" className="w-44" />
          <TextInput label="金額（円）" type="number" inputMode="numeric" min={1} value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="例: 3000" className="w-32" />
          <Button size="sm" variant={submitting ? 'disabled' : 'primary'} onClick={handleAdd}>追加</Button>
        </div>
        {formError && <p className="mt-xs font-body text-[13px] text-warning">{formError}</p>}
      </div>
    </div>
  )
}

export interface EntryTabProps {
  month: string
  // 今月（サーバーJSTの current_month）。選択中の月が今月なら「日」の初期値を今日にする。
  // 未指定なら端末時刻から JST の今月を求める。
  currentMonth?: string
}

export function EntryTab({ month, currentMonth }: EntryTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('変動費')
  const [config, setConfig] = useState<ConfigOut | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  // 割り勘連携が使えるか。Worker専用の機能なので、ローカルのFastAPIや
  // 連携を切った本番では false のままになり、反映ボタンは出ない。
  const [warikanEnabled, setWarikanEnabled] = useState(false)
  // サブタブを押す（または入力タブを開く＝初期値1）たびに増やし、パネルに追加フォームへのスクロールを依頼する。
  const [scrollRequest, setScrollRequest] = useState(1)

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e: unknown) => setConfigError(e instanceof Error ? e.message : 'エラーが発生しました'))
    // 失敗（404・連携なし）は「連携無効」として扱い、画面にエラーは出さない。
    getWarikanStatus()
      .then((status) => setWarikanEnabled(status.enabled))
      .catch(() => setWarikanEnabled(false))
  }, [])

  const categories = config?.categories[subTab] ?? []
  const bundleKind = BUNDLE_KIND[subTab]
  // 今月のシートなら今日の日、それ以外は空欄（日付なし）。
  const defaultDay = month === (currentMonth ?? jstMonth()) ? String(jstDayOfMonth()) : ''

  return (
    <div>
      <SectionTitle level="heading-xl" className="text-on-dark">データ入力 — {month}</SectionTitle>
      <p className="mt-xs font-body text-[13px] leading-[1.8] text-mute-dark">
        ここで入力したデータはデータベースに保存され、グラフや集計に反映されます。
      </p>

      {/* サブタブ */}
      <div className="mt-lg flex flex-wrap gap-xs">
        {SUB_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setSubTab(t)
              setScrollRequest((n) => n + 1)
            }}
            className={`font-body text-[13px] font-medium px-md py-sm rounded-sm transition-colors ${
              t === subTab
                ? 'bg-primary text-on-dark'
                : 'bg-surface-dark-elevated text-mute-dark hover:text-on-dark border border-hairline-dark'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <p className="mt-sm font-body text-[12px] leading-[1.8] text-mute-dark">{HELP_TEXT[subTab]}</p>

      <div className="mt-md">
        {configError && <p className="font-body text-[13px] text-warning">{configError}</p>}
        {/* config の到着を待たずにパネルを描画する（getConfig と getEntries を同時に走らせる）。
            カテゴリ未着の間は EntryGroupPanel 側で select と追加ボタンを無効化して、
            「選択肢が空のまま追加できてしまう」状態を防いでいる。 */}
        {!configError && (
          bundleKind
            ? <BundlePanel month={month} kind={bundleKind} scrollRequest={scrollRequest} />
            : (
                <EntryGroupPanel
                  month={month}
                  group={subTab}
                  categories={categories}
                  formOnTop={QUICK_ENTRY_TABS.includes(subTab)}
                  newestFirst={QUICK_ENTRY_TABS.includes(subTab)}
                  defaultCategory={DEFAULT_CATEGORY[subTab]}
                  showDay={DAY_TABS.includes(subTab)}
                  defaultDay={defaultDay}
                  showTotal={TOTAL_TABS.includes(subTab)}
                  sortable={SORTABLE_TABS.includes(subTab)}
                  scrollRequest={scrollRequest}
                  showWarikan={warikanEnabled && WARIKAN_TABS.includes(subTab)}
                />
              )
        )}
      </div>
    </div>
  )
}
