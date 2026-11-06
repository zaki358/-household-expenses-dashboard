/**
 * TypeScript mirrors of the backend's Pydantic response models.
 * Source: C:\Users\barub\company\kakei-dashboard-2\backend\api\schemas.py
 *
 * Field names match the JSON wire format exactly (Japanese keys) — the
 * backend serializes Pydantic models using their declared field names.
 */

export interface MonthlySummaryRow {
  年月: string
  収入: number
  夫収入: number
  妻収入: number
  支出: number
  投資: number
  貯金: number
  累計貯金: number
  投資累計: number
  純資産: number
}

export interface SummaryResponse {
  months: string[]
  summary: MonthlySummaryRow[]
  warnings: string[]
  current_month: string
}

export interface ComparisonRow {
  項目: string
  今月: number
  前月: number
  差額: number
  増減率: number | null
}

export interface DashboardResponse {
  month: string
  current: MonthlySummaryRow
  comparison: ComparisonRow[] | null
}

export interface ExpenseBreakdownRow {
  カテゴリ: string
  グループ: string
  金額: number
}

export interface GroupTotalRow {
  グループ: string
  金額: number
  月: string
}

export interface ChartsResponse {
  month: string
  expense_breakdown: ExpenseBreakdownRow[]
  group_totals_current: GroupTotalRow[]
  group_totals_previous: GroupTotalRow[]
  trend: MonthlySummaryRow[]
}

export interface IndexedEntry {
  id: number
  年月: string
  カテゴリ: string
  金額: number
  備考: string
  // その月の何日か（変動費・車・バイク・投資で任意入力）。null/未設定は日付なし。
  日?: number | null
  // 割り勘アプリへ反映済みの場合、その支出ID。null/未設定は未反映。
  割り勘ID?: string | null
}

/** 割り勘アプリ側のユーザー（支払者の候補）。 */
export interface WarikanUser {
  user_id: string
  display_name: string
}

/** 割り勘連携が使える状態かどうか。false なら反映ボタンは出さない。 */
export interface WarikanStatus {
  enabled: boolean
}

export interface IndexedBundleItem {
  id: number
  年月: string
  名前: string
  金額: number
}

export interface Goal {
  name: string
  target_amount: number
  source: 'savings' | 'net_worth'
}

export interface GoalStatus {
  名前: string
  目標額: number
  現在額: number
  達成率: number
  残額: number
  予想達成日: string | null
  月平均貯金: number
}

export interface ConfigOut {
  investment_as_expense: boolean
  categories: Record<string, string[]>
  category_usage: Record<string, number>
  active_goal: string | null
  dashboard_months: string[]
}

export interface ImportProposal {
  行: number
  変更前年月: string
  年月: string
  カテゴリ: string
  金額: number
  備考: string
}

export interface ImportSkipped {
  行: number
  理由: string
}

export interface ImportReport {
  ok: boolean
  error: string | null
  proposals: ImportProposal[]
  skipped: ImportSkipped[]
  unknown_categories: string[]
  dry_run: boolean
  committed: number
}

export interface MonthDeleteResponse {
  month: string
  deleted_entries: number
  deleted_bundle_items: number
}

export interface EnsureMonthResponse {
  month: string
  created: boolean
  base: string | null
  carried_entries: number
  carried_bundle_items: number
}
