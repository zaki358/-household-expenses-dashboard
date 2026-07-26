import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  createCategory,
  createGoal,
  createNextMonth,
  deleteCategory,
  deleteGoal,
  exportBundleUrl,
  exportEntriesUrl,
  getConfig,
  getGoals,
  importCsv,
  setActiveGoal,
  updateInvestmentMode,
} from '../../api/client'
import type { ConfigOut, Goal, ImportReport } from '../../api/types'
import { Button } from '../../components/Button'
import { SectionTitle } from '../../components/SectionTitle'
import { TextInput } from '../../components/TextInput'

const darkSelectClass =
  'rounded-sm border border-hairline-dark bg-surface-dark-elevated text-on-dark font-body text-[15px] px-sm py-sm outline-none focus:border-2 focus:border-primary'

function Divider() {
  return <hr className="my-xl border-hairline-dark" />
}

function GoalSection() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [activeGoal, setActiveGoalState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newSource, setNewSource] = useState<'savings' | 'net_worth'>('savings')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const refresh = () => {
    setLoading(true)
    Promise.all([getGoals(), getConfig()])
      .then(([gs, cfg]) => {
        setGoals(gs)
        setActiveGoalState(cfg.active_goal)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'エラーが発生しました'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  const handleAdd = async () => {
    if (!newName.trim()) { setFormError('目標名を入力してください'); return }
    const targetNum = parseInt(newTarget, 10)
    if (isNaN(targetNum) || targetNum <= 0) { setFormError('目標額は1以上の整数を入力してください'); return }
    setSubmitting(true)
    setFormError(null)
    setSuccessMsg(null)
    try {
      await createGoal(newName.trim(), targetNum, newSource)
      setSuccessMsg(`「${newName.trim()}」を追加しました。`)
      setNewName('')
      setNewTarget('')
      refresh()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (name: string) => {
    try { await deleteGoal(name); refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '削除に失敗しました') }
  }

  const handleSetActive = async (name: string) => {
    try { await setActiveGoal(name); setActiveGoalState(name); refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '切替に失敗しました') }
  }

  if (loading) return <p className="font-body text-[13px] text-mute-dark">読み込み中...</p>

  return (
    <div>
      <SectionTitle level="heading-lg" className="text-on-dark">目標管理</SectionTitle>
      <p className="mt-xs font-body text-[13px] leading-[1.8] text-mute-dark">
        貯金の目標をいくつでも登録できます。「表示する」で選んだものが目標タブに表示されます。
      </p>
      {error && <p className="mt-sm font-body text-[13px] text-warning">{error}</p>}

      {goals.length > 0 ? (
        <table className="mt-md w-full text-left font-body text-[13px] leading-[1.6]">
          <thead>
            <tr className="border-b border-hairline-dark text-mute-dark">
              <th className="py-xs font-medium">目標名</th>
              <th className="py-xs font-medium">目標額</th>
              <th className="py-xs font-medium">算出元</th>
              <th className="py-xs font-medium">表示</th>
              <th className="py-xs" />
            </tr>
          </thead>
          <tbody>
            {goals.map((g) => (
              <tr key={g.name} className="border-b border-hairline-dark text-on-dark">
                <td className="py-xs">{g.name}</td>
                <td className="py-xs">{g.target_amount.toLocaleString()} 円</td>
                <td className="py-xs">{g.source === 'net_worth' ? '純資産' : '累計貯金額'}</td>
                <td className="py-xs">
                  {g.name === activeGoal ? (
                    <span className="text-primary text-[12px]">● 表示中</span>
                  ) : (
                    <button type="button" onClick={() => handleSetActive(g.name)}
                      className="text-[12px] text-link-dark hover:underline">表示する</button>
                  )}
                </td>
                <td className="py-xs text-right">
                  <button type="button" onClick={() => handleDelete(g.name)}
                    className="text-[12px] text-warning hover:opacity-70">削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-sm font-body text-[13px] text-mute-dark">まだ目標がありません。</p>
      )}

      <div className="mt-lg">
        <p className="font-body text-[13px] font-medium text-on-dark mb-sm">目標を追加</p>
        <div className="flex flex-wrap gap-sm items-end">
          <TextInput label="目標名" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="例: 車の買い替え" className="w-44" />
          <TextInput label="目標額（円）" type="number" min={1} value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)} placeholder="例: 1000000" className="w-36" />
          <div className="flex flex-col gap-xxs">
            <span className="font-body text-[13px] text-mute-dark">現在額の算出元</span>
            <div className="flex gap-md">
              {([['savings', '累計貯金額'], ['net_worth', '純資産（貯金+投資）']] as const).map(([val, label]) => (
                <label key={val} className="flex items-center gap-xs font-body text-[13px] text-on-dark cursor-pointer">
                  <input type="radio" name="goal-source" value={val}
                    checked={newSource === val} onChange={() => setNewSource(val)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Button size="sm" variant={submitting ? 'disabled' : 'primary'} onClick={handleAdd}>追加</Button>
        </div>
        {formError && <p className="mt-xs font-body text-[13px] text-warning">{formError}</p>}
        {successMsg && <p className="mt-xs font-body text-[13px] text-link-dark">{successMsg}</p>}
      </div>
    </div>
  )
}

function InvestmentSection() {
  const [investAsExpense, setInvestAsExpense] = useState<boolean>(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    getConfig()
      .then((cfg) => { setInvestAsExpense(cfg.investment_as_expense); setError(null) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'エラーが発生しました'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccessMsg(null)
    try {
      await updateInvestmentMode(investAsExpense)
      setSuccessMsg('設定を保存しました。')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="font-body text-[13px] text-mute-dark">読み込み中...</p>

  return (
    <div>
      <SectionTitle level="heading-lg" className="text-on-dark">投資の扱い</SectionTitle>
      <div className="mt-sm flex flex-col gap-sm">
        {([
          [true, '支出に含める（現在の運用）'],
          [false, '資産移動として扱う（支出に含めない）'],
        ] as const).map(([val, label]) => (
          <label key={String(val)} className="flex items-center gap-xs font-body text-[14px] text-on-dark cursor-pointer">
            <input type="radio" name="invest-mode" checked={investAsExpense === val}
              onChange={() => setInvestAsExpense(val)} />
            {label}
          </label>
        ))}
      </div>
      <p className="mt-xs font-body text-[12px] leading-[1.8] text-mute-dark">
        どちらの場合も「月間貯金額」は現金ベース（収入 − 支出 − 投資）で計算されます。
      </p>
      <div className="mt-md">
        <Button size="sm" variant={saving ? 'disabled' : 'primary'} onClick={handleSave}>保存</Button>
      </div>
      {error && <p className="mt-xs font-body text-[13px] text-warning">{error}</p>}
      {successMsg && <p className="mt-xs font-body text-[13px] text-link-dark">{successMsg}</p>}
    </div>
  )
}

function CategorySection() {
  const [config, setConfig] = useState<ConfigOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const refresh = () => {
    getConfig()
      .then((cfg) => {
        setConfig(cfg)
        if (!selectedGroup && Object.keys(cfg.categories).length > 0) {
          setSelectedGroup(Object.keys(cfg.categories)[0])
        }
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'エラーが発生しました'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  const handleAdd = async () => {
    if (!selectedGroup) { setFormError('グループを選択してください'); return }
    if (!newCatName.trim()) { setFormError('カテゴリ名を入力してください'); return }
    setSubmitting(true)
    setFormError(null)
    setSuccessMsg(null)
    try {
      await createCategory(selectedGroup, newCatName.trim())
      setSuccessMsg(`「${newCatName.trim()}」を ${selectedGroup} に追加しました。`)
      setNewCatName('')
      refresh()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (name: string) => {
    try { await deleteCategory(name); refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '削除に失敗しました') }
  }

  if (loading) return <p className="font-body text-[13px] text-mute-dark">読み込み中...</p>

  const groups = config ? Object.keys(config.categories) : []

  return (
    <div>
      <SectionTitle level="heading-lg" className="text-on-dark">カテゴリ管理</SectionTitle>
      {error && <p className="mt-sm font-body text-[13px] text-warning">{error}</p>}
      <div className="mt-sm flex flex-wrap gap-sm items-end">
        <div className="flex flex-col gap-xxs">
          <label className="font-body text-[13px] text-mute-dark" htmlFor="cat-group">グループ</label>
          <select id="cat-group" value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}
            className={darkSelectClass}>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <TextInput label="カテゴリ名" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
          placeholder="例: 医療費" className="w-44" />
        <Button size="sm" variant={submitting ? 'disabled' : 'secondary'} onClick={handleAdd}>追加</Button>
      </div>
      {formError && <p className="mt-xs font-body text-[13px] text-warning">{formError}</p>}
      {successMsg && <p className="mt-xs font-body text-[13px] text-link-dark">{successMsg}</p>}

      {config && (
        <div className="mt-lg">
          <p className="font-body text-[13px] font-medium text-on-dark mb-sm">現在のカテゴリ一覧</p>
          {groups.map((g) => (
            <div key={g} className="mt-sm">
              <p className="font-body text-[13px] font-semibold text-on-dark">{g}</p>
              <table className="mt-xxs w-full text-left font-body text-[13px] leading-[1.6]">
                <tbody>
                  {config.categories[g].map((name) => {
                    const usage = config.category_usage[name] ?? 0
                    return (
                      <tr key={name} className="border-b border-hairline-dark text-on-dark">
                        <td className="py-xs">{name}</td>
                        <td className="py-xs text-right text-mute-dark">
                          {usage > 0 ? `使用中 ${usage}件` : ''}
                        </td>
                        <td className="py-xs text-right w-20">
                          {usage === 0 && (
                            <button type="button" onClick={() => handleDelete(name)}
                              className="text-[12px] text-warning hover:opacity-70">削除</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      <p className="mt-md font-body text-[12px] text-mute-dark">
        💡 サブスクの管理は「入力」タブの「サブスク」で行えます。
      </p>
    </div>
  )
}

function NextMonthSection() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleCreate = async () => {
    setLoading(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const result = await createNextMonth()
      setSuccessMsg(`${result.month} を作成しました。`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <SectionTitle level="heading-lg" className="text-on-dark">翌月の作成</SectionTitle>
      <p className="mt-xs font-body text-[13px] leading-[1.8] text-mute-dark">
        先月の固定費とサブスクを引き継いで翌月を作成します。
      </p>
      <div className="mt-md">
        <Button size="sm" variant={loading ? 'disabled' : 'secondary'} onClick={handleCreate}>
          ➕ 翌月を作成
        </Button>
      </div>
      {error && <p className="mt-xs font-body text-[13px] text-warning">{error}</p>}
      {successMsg && <p className="mt-xs font-body text-[13px] text-link-dark">{successMsg}</p>}
    </div>
  )
}

function DataSection() {
  const [csvText, setCsvText] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setCsvText(null)
    setFileName('')
    setReport(null)
    setError(null)
    setDoneMsg(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setDoneMsg(null)
    setReport(null)
    setAnalyzing(true)
    try {
      const text = await file.text()
      setCsvText(text)
      setFileName(file.name)
      const result = await importCsv(text, true) // dry-run
      setReport(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '取込の確認に失敗しました')
      setCsvText(null)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCommit = async () => {
    if (csvText === null) return
    setCommitting(true)
    setError(null)
    try {
      const result = await importCsv(csvText, false)
      setDoneMsg(`${result.committed}件を取り込みました。反映するには画面を再読み込みしてください。`)
      setReport(null)
      setCsvText(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '取込に失敗しました')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div>
      <SectionTitle level="heading-lg" className="text-on-dark">データCSV（取込・書き出し）</SectionTitle>
      <p className="mt-xs font-body text-[13px] leading-[1.8] text-mute-dark">
        年月・カテゴリ・金額の3列のCSVを取り込めます。取り込む前に「変更前→変更後」を確認できます。
      </p>

      {/* 取込 */}
      <div className="mt-md">
        <p className="font-body text-[13px] font-medium text-on-dark mb-sm">CSVを取り込む</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="block font-body text-[13px] text-on-dark file:mr-sm file:rounded-sm file:border-0 file:bg-primary file:px-md file:py-sm file:text-on-dark file:font-medium"
        />
        {analyzing && <p className="mt-sm font-body text-[13px] text-mute-dark">確認中...</p>}
        {error && <p className="mt-sm font-body text-[13px] text-warning">{error}</p>}
        {doneMsg && <p className="mt-sm font-body text-[13px] text-link-dark">✅ {doneMsg}</p>}
      </div>

      {report && (
        <div className="mt-lg">
          <p className="font-body text-[13px] text-on-dark">
            <span className="font-medium">{fileName}</span> — 取込予定 {report.proposals.length}件
            {report.skipped.length > 0 && <span className="text-warning">／スキップ {report.skipped.length}件</span>}
          </p>

          {report.unknown_categories.length > 0 && (
            <p className="mt-xs font-body text-[12px] leading-[1.8] text-warning">
              ⚠ 未登録カテゴリ（「未分類」として支出扱いになります）: {report.unknown_categories.join('、')}
            </p>
          )}

          {report.proposals.length > 0 && (
            <div className="mt-sm max-h-64 overflow-y-auto overflow-x-auto">
              <table className="w-full text-left font-body text-[12px] leading-[1.6]">
                <thead>
                  <tr className="border-b border-hairline-dark text-mute-dark">
                    <th className="py-xs pr-sm font-medium">行</th>
                    <th className="py-xs pr-sm font-medium">年月（変更前→後）</th>
                    <th className="py-xs pr-sm font-medium">カテゴリ</th>
                    <th className="py-xs font-medium">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {report.proposals.slice(0, 200).map((p) => (
                    <tr key={p.行} className="border-b border-hairline-dark text-on-dark">
                      <td className="py-xs pr-sm text-mute-dark">{p.行}</td>
                      <td className="py-xs pr-sm whitespace-nowrap">
                        {p.変更前年月 === p.年月 ? p.年月 : (
                          <span><span className="text-mute-dark">{p.変更前年月}</span> → {p.年月}</span>
                        )}
                      </td>
                      <td className="py-xs pr-sm">{p.カテゴリ}</td>
                      <td className="py-xs">{p.金額.toLocaleString()} 円</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.proposals.length > 200 && (
                <p className="mt-xs font-body text-[12px] text-mute-dark">…ほか {report.proposals.length - 200}件</p>
              )}
            </div>
          )}

          {report.skipped.length > 0 && (
            <div className="mt-sm">
              <p className="font-body text-[12px] font-medium text-warning">スキップした行</p>
              <ul className="mt-xxs list-disc pl-lg font-body text-[12px] leading-[1.7] text-mute-dark">
                {report.skipped.slice(0, 50).map((s) => (
                  <li key={s.行}>{s.行}行目: {s.理由}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-md flex gap-sm">
            <Button
              size="sm"
              variant={committing || report.proposals.length === 0 ? 'disabled' : 'primary'}
              onClick={handleCommit}
            >
              {committing ? '取込中...' : `${report.proposals.length}件を取り込む`}
            </Button>
            <Button size="sm" variant="secondary" onClick={reset}>キャンセル</Button>
          </div>
        </div>
      )}

      {/* 書き出し */}
      <div className="mt-xl">
        <p className="font-body text-[13px] font-medium text-on-dark mb-sm">CSVを書き出す</p>
        <div className="flex flex-wrap gap-md font-body text-[13px]">
          <a href={exportEntriesUrl} download className="text-link-dark hover:underline">⬇ 支出データ（年月・カテゴリ・金額）</a>
          <a href={exportBundleUrl('subscriptions')} download className="text-link-dark hover:underline">⬇ サブスク</a>
          <a href={exportBundleUrl('communications')} download className="text-link-dark hover:underline">⬇ 通信費</a>
        </div>
        <p className="mt-xs font-body text-[12px] leading-[1.8] text-mute-dark">
          書き出したCSVは会計チェック（kakei-check）でそのまま検証できます。
        </p>
      </div>
    </div>
  )
}

export function SettingsTab() {
  return (
    <div>
      <SectionTitle level="heading-xl" className="text-on-dark">⚙️ 設定</SectionTitle>
      <div className="mt-xl"><DataSection /></div>
      <Divider />
      <GoalSection />
      <Divider />
      <InvestmentSection />
      <Divider />
      <CategorySection />
      <Divider />
      <NextMonthSection />
    </div>
  )
}
