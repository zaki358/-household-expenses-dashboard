import type { ExpenseBreakdownRow } from '../../api/types'
import { colorForCategory } from '../../charts/categoryColors'
import { formatYen } from '../../utils/currency'
import { summarizeExpenses } from '../../utils/expenseSummary'

export interface ExpenseTableProps {
  data: ExpenseBreakdownRow[]
  month: string
}

/** 支出一覧表 — グループ小計＋カテゴリ別金額・割合。円グラフの数値版。 */
export function ExpenseTable({ data, month }: ExpenseTableProps) {
  if (data.length === 0) {
    return (
      <p className="font-body text-[16px] leading-[1.8] text-mute-dark" data-testid="expense-table-empty">
        {month} の支出データがありません
      </p>
    )
  }

  const summary = summarizeExpenses(data)

  return (
    <table className="w-full text-left font-body text-[14px] leading-[1.6]" data-testid="expense-table">
      <thead>
        <tr className="border-b border-hairline-dark text-mute-dark">
          <th className="py-sm font-medium">カテゴリ</th>
          <th className="py-sm text-right font-medium">金額</th>
          <th className="py-sm text-right font-medium">割合</th>
        </tr>
      </thead>
      <tbody>
        {summary.groups.map((group) => (
          <GroupBlock key={group.グループ} group={group} />
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-hairline-dark font-semibold text-on-dark" data-testid="expense-table-total">
          <td className="py-sm">合計</td>
          <td className="py-sm text-right">{formatYen(summary.合計)}</td>
          <td className="py-sm text-right">100.0%</td>
        </tr>
      </tfoot>
    </table>
  )
}

function GroupBlock({ group }: { group: ReturnType<typeof summarizeExpenses>['groups'][number] }) {
  return (
    <>
      <tr className="border-b border-hairline-dark font-semibold text-on-dark" data-testid="expense-table-group-row">
        <td className="py-sm">{group.グループ}</td>
        <td className="py-sm text-right">{formatYen(group.小計)}</td>
        <td className="py-sm text-right">{group.割合.toFixed(1)}%</td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.カテゴリ} className="border-b border-hairline-dark text-on-dark" data-testid="expense-table-category-row">
          <td className="py-sm">
            <span
              aria-hidden="true"
              data-testid="expense-table-swatch"
              className="mr-xs inline-block h-[10px] w-[10px] rounded-sm align-middle"
              style={{ backgroundColor: colorForCategory(row.カテゴリ) }}
            />
            {row.カテゴリ}
          </td>
          <td className="py-sm text-right">{formatYen(row.金額)}</td>
          <td className="py-sm text-right">{row.割合.toFixed(1)}%</td>
        </tr>
      ))}
    </>
  )
}
