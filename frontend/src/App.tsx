import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ensureCurrentMonth, getSummary } from './api/client'
import { Badge } from './components/Badge'
import { Band } from './components/Band'
import { Container } from './components/Container'
import { MonthSelector } from './components/MonthSelector'
import { Nav } from './components/Nav'
import { SectionTitle } from './components/SectionTitle'
import { Dashboard } from './features/dashboard/Dashboard'
import { EntryTab } from './features/entry/EntryTab'
import { GoalTab } from './features/goal/GoalTab'
import { SettingsTab } from './features/settings/SettingsTab'

// recharts(+d3)を引くグラフタブだけ遅延ロードし、初回JSバンドルから除外する。
const ChartsTab = lazy(() => import('./features/charts/ChartsTab').then((m) => ({ default: m.ChartsTab })))

type Tab = 'dashboard' | 'charts' | 'entry' | 'goal' | 'settings'

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'ダッシュボード',
  charts: 'グラフ',
  entry: '入力',
  goal: '目標',
  settings: '設定',
}

/** Short labels + icons for the mobile bottom tab bar (thumb navigation). */
const TAB_SHORT: Record<Tab, string> = {
  dashboard: 'ホーム',
  charts: 'グラフ',
  entry: '入力',
  goal: '目標',
  settings: '設定',
}

const TAB_ICONS: Record<Tab, string> = {
  dashboard: '🏠',
  charts: '📊',
  entry: '✏️',
  goal: '🎯',
  settings: '⚙️',
}

/** Tabs that require a month to be selected (show the month selector bar). */
const MONTH_TABS = new Set<Tab>(['dashboard', 'charts', 'entry'])

function App() {
  // 起動時は「入力」タブ。最も開く頻度が高い画面のため。
  const [tab, setTab] = useState<Tab>('entry')
  // null = summary 未解決（読み込み中）。[] と区別することで、summary を待たずに
  // Dashboard/ChartsTab を楽観的に描き始められる。
  const [dataMonths, setDataMonths] = useState<string[] | null>(null)
  const [month, setMonth] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  // 今月 (YYYY-MM)。マウント時に一度だけ確定する（render毎に new Date() しない）。
  // サーバー(JST)の応答が届くまでのプレースホルダに過ぎない — 端末TZがJSTとズレていると
  // ブラウザローカル時刻はサーバーの「今月」と食い違いうるため、真実の源にはしない。
  const [browserMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  // /api/summary の current_month（JST）。届き次第これを今月として採用する。
  const [serverMonth, setServerMonth] = useState<string | null>(null)
  // 当月シートが自動準備されたときに EntryTab 等を作り直すためのバージョン番号。
  const [dataVersion, setDataVersion] = useState(0)
  // 自動準備で今月が新規作成された場合、その月をここに入れて1行通知する。
  const [ensuredMonth, setEnsuredMonth] = useState<string | null>(null)

  // 当月シートの自動準備。マウント時に1回だけ POST する。
  const bootstrapped = useRef(false)
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true // await の前に立てる（StrictModeの二重マウントでも1回だけ発火させる）
    ensureCurrentMonth()
      .then((result) => {
        setServerMonth(result.month)
        if (result.created) {
          setDataVersion((v) => v + 1)
          setEnsuredMonth(result.month)
        }
      })
      .catch(() => {
        /* 失敗しても表示は継続する（従来どおりの見た目のまま） */
      })
  }, [])

  useEffect(() => {
    if (!MONTH_TABS.has(tab)) return
    getSummary()
      .then((summary) => {
        setDataMonths(summary.months)
        setWarnings(summary.warnings)
        setServerMonth(summary.current_month)
      })
      .catch(() => {
        setDataMonths([])
      })
  }, [tab, dataVersion])

  // 表示・入力の対象月。ユーザーが明示的に選んでいなければ、サーバーの今月（無ければブラウザの今月）。
  const todayMonth = serverMonth ?? browserMonth
  const selectedMonth = month ?? todayMonth
  const displayWarnings = ensuredMonth
    ? [...warnings, `${ensuredMonth} を作成し、固定費・サブスクを引き継ぎました`]
    : warnings
  const summaryLoading = dataMonths === null
  const months = dataMonths ?? []
  // 月ピル = データがある月 ∪ 今月（YYYY-MM文字列なので辞書順=時系列順）
  // dataMonths(stateそのもの)を依存にする — `months`は毎レンダー新規配列になりうるため。
  const pillMonths = useMemo(
    () => Array.from(new Set([...(dataMonths ?? []), todayMonth])).sort(),
    [dataMonths, todayMonth],
  )
  const selectedMonthHasData = months.includes(selectedMonth)
  const hasAnyData = months.length > 0
  // summary の解決を待たずに描き始める。データが無いと確定した時点で空状態に差し替える。
  const showDashboard = summaryLoading || selectedMonthHasData

  const showMonthBar = MONTH_TABS.has(tab)

  return (
    <div>
      <Nav
        logo={<span className="font-display font-light text-[16px] md:text-[20px]">家計ダッシュボード</span>}
        navItems={
          <div className="hidden md:flex items-center gap-xs">
            {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-md py-xs rounded-full transition-colors ${
                  tab === key
                    ? 'bg-surface-dark-elevated text-on-dark'
                    : 'text-on-dark-mute hover:text-on-dark'
                }`}
              >
                {TAB_LABELS[key]}
              </button>
            ))}
          </div>
        }
        rightCluster={<Badge>v0</Badge>}
      />

      {displayWarnings.length > 0 && (
        <Band variant="light" className="py-md!">
          <Container>
            {displayWarnings.map((warning) => (
              <p key={warning} className="font-body text-[14px] leading-[1.8] text-warning">
                ⚠ {warning}
              </p>
            ))}
          </Container>
        </Band>
      )}

      {showMonthBar && (
        <Band variant="dark" className="py-md! border-b border-hairline-dark">
          <Container>
            <MonthSelector months={pillMonths} selected={selectedMonth} onSelect={setMonth} />
          </Container>
        </Band>
      )}

      <Band variant="dark" className="py-xxl! px-lg!">
        <Container>
          {tab === 'dashboard' && showDashboard && <Dashboard month={selectedMonth} />}
          {tab === 'dashboard' && !summaryLoading && !hasAnyData && (
            <div>
              <SectionTitle level="heading-lg">データがありません</SectionTitle>
              <p className="mt-sm font-body text-[16px] leading-[1.8] text-mute-dark">
                「入力」タブから収入・固定費などを入力するか、CSVを backend/data に配置してください。
                <br />
                必要な列: <strong>年月</strong>（例: 2026-01）、<strong>カテゴリ</strong>、<strong>金額</strong>
              </p>
            </div>
          )}
          {tab === 'dashboard' && !summaryLoading && hasAnyData && !selectedMonthHasData && (
            <div>
              <SectionTitle level="heading-lg">{selectedMonth} のデータはまだありません</SectionTitle>
              <p className="mt-sm font-body text-[16px] leading-[1.8] text-mute-dark">
                「入力」タブから登録するか、上の月から選んでください。
              </p>
            </div>
          )}

          {tab === 'charts' && showDashboard && (
            <Suspense
              fallback={
                <p className="font-body text-[16px] leading-[1.8] text-mute-dark">読み込み中...</p>
              }
            >
              <ChartsTab month={selectedMonth} />
            </Suspense>
          )}
          {tab === 'charts' && !summaryLoading && !hasAnyData && (
            <p className="font-body text-[16px] leading-[1.8] text-mute-dark">
              「入力」タブからデータを入力してください。
            </p>
          )}
          {tab === 'charts' && !summaryLoading && hasAnyData && !selectedMonthHasData && (
            <p className="font-body text-[16px] leading-[1.8] text-mute-dark">
              {selectedMonth} のデータはまだありません。「入力」タブから登録するか、上の月から選んでください。
            </p>
          )}

          {tab === 'entry' && <EntryTab key={`${selectedMonth}#${dataVersion}`} month={selectedMonth} currentMonth={todayMonth} />}
          {tab === 'goal' && <GoalTab />}
          {tab === 'settings' && <SettingsTab />}
        </Container>
      </Band>

      {/* スペーサー: モバイルの固定タブバーが本文末尾を隠さないように */}
      <div className="h-[64px] md:hidden" aria-hidden />

      {/* モバイル用: 親指で押せる下部固定タブバー（<md のみ） */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 flex bg-canvas-dark border-t border-hairline-dark"
        data-testid="mobile-tabbar"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] font-body text-[11px] leading-none transition-colors ${
              tab === key ? 'text-on-dark' : 'text-on-dark-mute'
            }`}
          >
            <span className="text-[18px] leading-none" aria-hidden>{TAB_ICONS[key]}</span>
            <span>{TAB_SHORT[key]}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
