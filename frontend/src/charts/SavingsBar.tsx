import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlySummaryRow } from '../api/types'
import { axisTextColor, chartPalette, gridColor, tooltipStyle } from './chartTheme'

export interface SavingsBarProps {
  data: MonthlySummaryRow[]
}

function formatYenAxis(value: number): string {
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(value)
}

/** 月間貯金額（棒グラフ）— 月ごとの貯金額。 */
export function SavingsBar({ data }: SavingsBarProps) {
  return (
    <div data-testid="savings-bar">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid stroke={gridColor} vertical={false} />
          <XAxis dataKey="年月" tick={{ fill: axisTextColor, fontSize: 12 }} />
          <YAxis tick={{ fill: axisTextColor, fontSize: 12 }} tickFormatter={formatYenAxis} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="貯金" fill={chartPalette.lead} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
