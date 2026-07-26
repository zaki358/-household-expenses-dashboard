import type { ExpenseBreakdownRow } from '../api/types'

/** 支出一覧表の1カテゴリ行。割合は生の百分率（例 12.5）。表示側で丸める。 */
export interface CategoryShareRow {
  カテゴリ: string
  金額: number
  割合: number
}

/** グループ小計セクション（小計行＋配下のカテゴリ行）。 */
export interface GroupSection {
  グループ: string
  小計: number
  割合: number
  rows: CategoryShareRow[]
}

export interface ExpenseSummary {
  合計: number
  groups: GroupSection[]
}

/**
 * カテゴリ別支出内訳（円グラフと同じ expense_breakdown）を、
 * グループ小計＋各カテゴリの割合(%)を持つ表用サマリーへ集計する純関数。
 *
 * - グループは小計の降順、グループ内カテゴリは金額の降順に並べる
 *   （バックエンドの並び順に依存しない）。
 * - 割合 = 金額 / 合計 * 100（合計0のときは0でゼロ除算を回避）。
 * - 表示時に toFixed(1) で丸めるため、表示上の割合の合計は
 *   ちょうど100.0%にならない場合がある（個人用途につき補正はしない）。
 */
export function summarizeExpenses(rows: readonly ExpenseBreakdownRow[]): ExpenseSummary {
  const 合計 = rows.reduce((sum, row) => sum + row.金額, 0)

  const byGroup = new Map<string, ExpenseBreakdownRow[]>()
  for (const row of rows) {
    const existing = byGroup.get(row.グループ)
    if (existing) {
      existing.push(row)
    } else {
      byGroup.set(row.グループ, [row])
    }
  }

  const share = (amount: number): number => (合計 === 0 ? 0 : (amount / 合計) * 100)

  const groups: GroupSection[] = Array.from(byGroup.entries())
    .map(([グループ, groupRows]) => {
      const 小計 = groupRows.reduce((sum, row) => sum + row.金額, 0)
      const categoryRows: CategoryShareRow[] = groupRows
        .map((row) => ({ カテゴリ: row.カテゴリ, 金額: row.金額, 割合: share(row.金額) }))
        .sort((a, b) => b.金額 - a.金額)
      return { グループ, 小計, 割合: share(小計), rows: categoryRows }
    })
    .sort((a, b) => b.小計 - a.小計)

  return { 合計, groups }
}
