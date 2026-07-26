import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlySummaryRow } from '../api/types'
import { axisTextColor, gridColor, tooltipStyle, trendSeriesColors } from './chartTheme'

export interface AssetTrendLineProps {
  data: MonthlySummaryRow[]
}

function formatYenAxis(value: number): string {
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(value)
}

/** 資産推移（折線グラフ）— 累計貯金・投資累計・純資産の月次推移。 */
export function AssetTrendLine({ data }: AssetTrendLineProps) {
  return (
    <div data-testid="asset-trend-line">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid stroke={gridColor} vertical={false} />
          <XAxis dataKey="年月" tick={{ fill: axisTextColor, fontSize: 12 }} />
          <YAxis tick={{ fill: axisTextColor, fontSize: 12 }} tickFormatter={formatYenAxis} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Line type="monotone" dataKey="累計貯金" stroke={trendSeriesColors.累計貯金} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="投資累計" stroke={trendSeriesColors.投資累計} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="純資産" stroke={trendSeriesColors.純資産} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
