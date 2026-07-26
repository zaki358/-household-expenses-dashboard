import { getCharts } from '../../api/client'
import { AssetTrendLine } from '../../charts/AssetTrendLine'
import { ExpensePie } from '../../charts/ExpensePie'
import { GroupBar } from '../../charts/GroupBar'
import { ExpenseTable } from './ExpenseTable'
import { SavingsBar } from '../../charts/SavingsBar'
import { SectionTitle } from '../../components/SectionTitle'
import { useApiResource } from '../../hooks/useApiResource'

export interface ChartsTabProps {
  month: string
}

/**
 * グラフタブ — 支出割合（円）・前月比較（グループ別棒）・資産推移（折線）・
 * 月間貯金額（棒）の4チャート。既存Streamlit版の charts.py と同じ構成。
 */
export function ChartsTab({ month }: ChartsTabProps) {
  const { data, loading, error } = useApiResource(() => getCharts(month), [month])

  if (loading) {
    return (
      <p className="font-body text-[16px] leading-[1.8] text-mute-dark" data-testid="charts-loading">
        読み込み中...
      </p>
    )
  }

  if (error) {
    return (
      <p className="font-body text-[16px] leading-[1.8] text-warning" data-testid="charts-error">
        {error}
      </p>
    )
  }

  if (!data) {
    return null
  }

  // group_totals_previous は前月に支出グループが1件も無くても空になり得るため、
  // 「前月が存在するか」は trend（全月サマリー）の月リストから判定する
  // （バックエンドの previous_month() と同じロジック）。
  const monthIndex = data.trend.findIndex((row) => row.年月 === data.month)
  const previousMonth = monthIndex > 0 ? data.trend[monthIndex - 1].年月 : null

  return (
    <div data-testid="charts-tab">
      <SectionTitle level="heading-lg">支出割合（{data.month}）</SectionTitle>
      <div className="grid grid-cols-1 gap-lg lg:grid-cols-2 lg:items-start">
        <ExpensePie data={data.expense_breakdown} month={data.month} />
        {data.expense_breakdown.length > 0 && <ExpenseTable data={data.expense_breakdown} month={data.month} />}
      </div>

      <SectionTitle level="heading-lg" className="mt-xl">
        前月比較（グループ別）
      </SectionTitle>
      <GroupBar
        current={data.group_totals_current}
        previous={data.group_totals_previous}
        currentMonth={data.month}
        previousMonth={previousMonth}
      />

      <SectionTitle level="heading-lg" className="mt-xl">
        資産推移
      </SectionTitle>
      <AssetTrendLine data={data.trend} />

      <SectionTitle level="heading-lg" className="mt-xl">
        月間貯金額
      </SectionTitle>
      <SavingsBar data={data.trend} />
    </div>
  )
}
