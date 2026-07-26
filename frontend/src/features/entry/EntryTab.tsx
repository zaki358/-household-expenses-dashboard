import { useEffect, useState } from 'react'
import {
  createBundleItem,
  createEntry,
  deleteBundleItem,
  deleteEntry,
  getBundleItems,
  getConfig,
  getEntries,
} from '../../api/client'
import type { ConfigOut, IndexedBundleItem, IndexedEntry } from '../../api/types'
import { Button } from '../../components/Button'
import { SectionTitle } from '../../components/SectionTitle'
import { TextInput } from '../../components/TextInput'
import { formatYen } from '../../utils/currency'

type SubTab = '変動費' | '収入' | '固定費' | 'インフラ' | '通信費' | 'サブスク' | '車' | 'バイク' | '投資'

// 変動費を先頭（＝入力画面を開いた直後の初期タブ）に。最も入力頻度が高いため。
const SUB_TABS: SubTab[] = ['変動費', '収入', '固定費', 'インフラ', '通信費', 'サブスク', '車', 'バイク', '投資']

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

const darkSelectClass =
  'rounded-sm border border-hairline-dark bg-surface-dark-elevated text-on-dark font-body text-[15px] px-sm py-sm outline-none focus:border-2 focus:border-primary'

interface EntryGroupPanelProps {
  month: string
  group: string
  categories: string[]
}

function EntryGroupPanel({ month, group, categories }: EntryGroupPanelProps) {
  const [entries, setEntries] = useState<IndexedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState(categories[0] ?? '')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const refresh = () => {
    setLoading(true)
    setError(null)
    getEntries(month, group)
      .then(setEntries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'エラーが発生しました'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setCategory(categories[0] ?? '')
    setAmount('')
    setFormError(null)
    refresh()
  }, [month, group])

  const handleAdd = async () => {
    const amountNum = parseInt(amount, 10)
    if (!category) { setFormError('カテゴリを選択してください'); return }
    if (isNaN(amountNum) || amountNum <= 0) { setFormError('金額は1以上の整数を入力してください'); return }
    setSubmitting(true)
    setFormError(null)
    try {
      await createEntry(month, category, amountNum)
      setAmount('')
      refresh()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteEntry(id)
      refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  if (loading) return <p className="font-body text-[13px] text-mute-dark">読み込み中...</p>
  if (error) return <p className="font-body text-[13px] text-warning">{error}</p>

  return (
    <div>
      {entries.length > 0 ? (
        <table className="w-full text-left font-body text-[13px] leading-[1.6]">
          <thead>
            <tr className="border-b border-hairline-dark">
              <th className="py-xs font-medium text-mute-dark">カテゴリ</th>
              <th className="py-xs font-medium text-mute-dark">金額</th>
              <th className="py-xs" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-hairline-dark text-on-dark">
                <td className="py-xs">{e.カテゴリ}</td>
                <td className="py-xs">{formatYen(e.金額)}</td>
                <td className="py-xs text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(e.id)}
                    className="font-body text-[12px] text-warning hover:opacity-70"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="font-body text-[13px] text-mute-dark">まだデータがありません。</p>
      )}

      <div className="mt-lg">
        <SectionTitle level="heading-md" className="text-on-dark">追加</SectionTitle>
        <div className="mt-sm flex flex-wrap gap-sm items-end">
          <div className="flex flex-col gap-xxs">
            <label className="font-body text-[13px] leading-[1.8] text-mute-dark" htmlFor={`cat-${group}`}>
              カテゴリ
            </label>
            <select id={`cat-${group}`} value={category} onChange={(e) => setCategory(e.target.value)} className={darkSelectClass}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <TextInput label="金額（円）" type="number" inputMode="numeric" min={1} value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="例: 3000" className="w-36" />
          <Button size="sm" variant={submitting ? 'disabled' : 'primary'} onClick={handleAdd}>追加</Button>
        </div>
        {formError && <p className="mt-xs font-body text-[13px] text-warning">{formError}</p>}
      </div>
    </div>
  )
}

interface BundlePanelProps {
  month: string
  kind: string
}

function BundlePanel({ month, kind }: BundlePanelProps) {
  const [items, setItems] = useState<IndexedBundleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const refresh = () => {
    setLoading(true)
    setError(null)
    getBundleItems(kind, month)
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'エラーが発生しました'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setName('')
    setAmount('')
    setFormError(null)
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
      refresh()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteBundleItem(kind, id)
      refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  if (loading) return <p className="font-body text-[13px] text-mute-dark">読み込み中...</p>
  if (error) return <p className="font-body text-[13px] text-warning">{error}</p>

  return (
    <div>
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
            {items.map((item) => (
              <tr key={item.id} className="border-b border-hairline-dark text-on-dark">
                <td className="py-xs">{item.名前}</td>
                <td className="py-xs">{formatYen(item.金額)}</td>
                <td className="py-xs text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="font-body text-[12px] text-warning hover:opacity-70"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="font-body text-[13px] text-mute-dark">まだデータがありません。</p>
      )}

      <div className="mt-lg">
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
}

export function EntryTab({ month }: EntryTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('変動費')
  const [config, setConfig] = useState<ConfigOut | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e: unknown) => setConfigError(e instanceof Error ? e.message : 'エラーが発生しました'))
  }, [])

  const categories = config?.categories[subTab] ?? []
  const bundleKind = BUNDLE_KIND[subTab]

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
            onClick={() => setSubTab(t)}
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
        {!configError && !config && (
          <p className="font-body text-[13px] text-mute-dark">読み込み中...</p>
        )}
        {/* config ロード完了後にのみパネルを描画する。
            未ロード時はカテゴリ一覧が空のままマウントされ、select は見た目だけ
            先頭項目を表示するが選択値は空文字になる不具合を防ぐ。 */}
        {!configError && config && (
          bundleKind
            ? <BundlePanel month={month} kind={bundleKind} />
            : <EntryGroupPanel month={month} group={subTab} categories={categories} />
        )}
      </div>
    </div>
  )
}
