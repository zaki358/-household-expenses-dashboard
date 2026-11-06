import type { IndexedEntry } from '../../api/types'
import { formatYen } from '../../utils/currency'
import { daysInMonth, monthNumber } from '../../utils/dates'

export const darkSelectClass =
  'rounded-sm border border-hairline-dark bg-surface-dark-elevated text-on-dark font-body text-[15px] px-sm py-sm outline-none focus:border-2 focus:border-primary'

/** select の値（'' = 日付なし）⇔ API の day（null = 日付なし）。 */
export function dayFromSelect(value: string): number | null {
  return value === '' ? null : parseInt(value, 10)
}

export function dayToSelect(day: number | null | undefined): string {
  return day == null ? '' : String(day)
}

interface DaySelectProps {
  id: string
  label: string
  month: string
  value: string
  onChange: (value: string) => void
}

/** 「日」だけを選ぶ select。月はシート（month）で決まるので、1〜その月の末日＋空欄（日付なし）。 */
export function DaySelect({ id, label, month, value, onChange }: DaySelectProps) {
  const last = daysInMonth(month)
  return (
    <div className="flex flex-col gap-xxs">
      <label className="font-body text-[13px] leading-[1.8] text-mute-dark" htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={darkSelectClass}>
        <option value="">—</option>
        {Array.from({ length: last }, (_, i) => i + 1).map((d) => (
          <option key={d} value={String(d)}>{d}日</option>
        ))}
      </select>
    </div>
  )
}

/** 一覧の行に出す「9/28」。日付なしなら null。 */
export function formatEntryDate(month: string, day: number | null | undefined): string | null {
  return day == null ? null : `${monthNumber(month)}/${day}`
}

/**
 * 日付順に並べ替えた新しい配列を返す（表示専用。DB・集計・CSVには影響しない）。
 * 日付ありが先・日付なしは末尾。newestFirst なら日付・id とも降順、そうでなければ昇順。
 */
export function sortEntriesByDay(entries: IndexedEntry[], newestFirst: boolean): IndexedEntry[] {
  const dir = newestFirst ? -1 : 1
  return [...entries].sort((a, b) => {
    const da = a.日 ?? null
    const db = b.日 ?? null
    if (da === null && db !== null) return 1
    if (da !== null && db === null) return -1
    if (da !== null && db !== null && da !== db) return (da - db) * dir
    return (a.id - b.id) * dir
  })
}

/** 一覧の並べ替えキー。表示専用で、各端末の画面状態としてだけ持つ（DB・相手の画面には影響しない）。 */
export type EntrySortKey = 'input' | 'amountDesc' | 'amountAsc' | 'dayNewest' | 'dayOldest'

export const ENTRY_SORT_OPTIONS: { key: EntrySortKey; label: string }[] = [
  { key: 'input', label: '入力順（新しい順）' },
  { key: 'amountDesc', label: '金額の大きい順' },
  { key: 'amountAsc', label: '金額の小さい順' },
  { key: 'dayNewest', label: '日付の新しい順' },
  { key: 'dayOldest', label: '日付の古い順' },
]

/**
 * 並べ替えた新しい配列を返す（元の配列は変更しない）。
 * 金額順で同額のときは新しく入力したもの（id降順）が上。日付順は日付なしが末尾。
 */
export function sortEntries(entries: IndexedEntry[], key: EntrySortKey): IndexedEntry[] {
  switch (key) {
    case 'amountDesc':
      return [...entries].sort((a, b) => b.金額 - a.金額 || b.id - a.id)
    case 'amountAsc':
      return [...entries].sort((a, b) => a.金額 - b.金額 || b.id - a.id)
    case 'dayNewest':
      return sortEntriesByDay(entries, true)
    case 'dayOldest':
      return sortEntriesByDay(entries, false)
    case 'input':
      return [...entries].sort((a, b) => b.id - a.id)
  }
}

interface SortSelectProps {
  id: string
  value: EntrySortKey
  onChange: (value: EntrySortKey) => void
}

export function SortSelect({ id, value, onChange }: SortSelectProps) {
  return (
    <div className="mb-sm flex items-center gap-sm">
      <label className="font-body text-[13px] leading-[1.8] text-mute-dark" htmlFor={id}>
        並べ替え
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as EntrySortKey)}
        className={darkSelectClass}
      >
        {ENTRY_SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

interface GroupTotalProps {
  amounts: number[]
}

/** タブの合計（件数つき）。固定費・インフラ・通信費・サブスク・車・バイクで表示する。 */
export function GroupTotal({ amounts }: GroupTotalProps) {
  const total = amounts.reduce((sum, a) => sum + a, 0)
  return (
    <p className="mb-sm font-body text-[15px] leading-[1.6] text-on-dark" data-testid="group-total">
      <span className="text-mute-dark mr-sm">合計</span>
      <span className="font-medium">{formatYen(total)}</span>
      <span className="ml-xs text-[13px] text-mute-dark">（{amounts.length}件）</span>
    </p>
  )
}
