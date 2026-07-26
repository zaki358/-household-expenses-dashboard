import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ExpenseBreakdownRow } from '../api/types'
import { colorForCategory } from './categoryColors'
import { tooltipStyle } from './chartTheme'

export interface ExpensePieProps {
  data: ExpenseBreakdownRow[]
  month: string
}

function formatYen(value: number | string | readonly (number | string)[] | undefined): string {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(numeric)) {
    return String(value)
  }
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(numeric)
}

/** 支出割合（円グラフ）— カテゴリ別の当月支出内訳。 */
export function ExpensePie({ data, month }: ExpensePieProps) {
  if (data.length === 0) {
    return (
      <p className="font-body text-[16px] leading-[1.8] text-mute-dark" data-testid="expense-pie-empty">
        {month} の支出データがありません
      </p>
    )
  }

  return (
    <div data-testid="expense-pie">
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie data={data} dataKey="金額" nameKey="カテゴリ" innerRadius={60} outerRadius={110} paddingAngle={1} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.カテゴリ} fill={colorForCategory(row.カテゴリ)} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatYen(value)} />
          <Legend wrapperStyle={{ fontFamily: "'Inter', Arial, Helvetica, sans-serif", fontSize: 14 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
