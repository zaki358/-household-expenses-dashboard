import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GroupTotalRow } from '../api/types'
import { axisTextColor, chartPalette, gridColor, tooltipStyle } from './chartTheme'

export interface GroupBarProps {
  current: GroupTotalRow[]
  previous: GroupTotalRow[]
  currentMonth: string
  previousMonth: string | null
}

interface MergedRow {
  グループ: string
  今月: number
  前月: number
}

function mergeByGroup(current: GroupTotalRow[], previous: GroupTotalRow[]): MergedRow[] {
  const groups = Array.from(new Set([...current.map((r) => r.グループ), ...previous.map((r) => r.グループ)]))
  return groups.map((グループ) => ({
    グループ,
    今月: current.find((r) => r.グループ === グループ)?.金額 ?? 0,
    前月: previous.find((r) => r.グループ === グループ)?.金額 ?? 0,
  }))
}

/** 前月比較（グループ別棒グラフ）— グループごとの当月・前月の支出を比較する。 */
export function GroupBar({ current, previous, currentMonth, previousMonth }: GroupBarProps) {
  if (previousMonth === null) {
    return (
      <p className="font-body text-[16px] leading-[1.8] text-mute-dark" data-testid="group-bar-empty">
        前月のデータがありません
      </p>
    )
  }

  const data = mergeByGroup(current, previous)

  return (
    <div data-testid="group-bar">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data}>
          <CartesianGrid stroke={gridColor} vertical={false} />
          <XAxis dataKey="グループ" tick={{ fill: axisTextColor, fontSize: 12 }} />
          <YAxis tick={{ fill: axisTextColor, fontSize: 12 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Bar dataKey="今月" name={currentMonth} fill={chartPalette.lead} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="前月" name={previousMonth} fill={chartPalette.tonal3} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
