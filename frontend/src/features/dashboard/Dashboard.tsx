import { getDashboard } from '../../api/client'
import type { ComparisonRow } from '../../api/types'
import { Metric } from '../../components/Metric'
import { ProductCard } from '../../components/ProductCard'
import { SectionTitle } from '../../components/SectionTitle'
import { useApiResource } from '../../hooks/useApiResource'
import { formatYen } from '../../utils/currency'

export interface DashboardProps {
  month: string
}

function findDelta(comparison: ComparisonRow[] | null, label: string): number | undefined {
  return comparison?.find((row) => row.項目 === label)?.差額
}

export function Dashboard({ month }: DashboardProps) {
  const { data, loading, error } = useApiResource(() => getDashboard(month), [month])

  if (loading) {
    return (
      <p className="font-body text-[14px] leading-[1.8] text-mute-dark" data-testid="dashboard-loading">
        読み込み中...
      </p>
    )
  }

  if (error) {
    return (
      <p className="font-body text-[14px] leading-[1.8] text-warning" data-testid="dashboard-error">
        {error}
      </p>
    )
  }

  if (!data) {
    return null
  }

  const { current, comparison } = data
  const otherIncome = current.収入 - current.夫収入 - current.妻収入

  return (
    <div data-testid="dashboard">
      <SectionTitle level="heading-xl">{data.month} のサマリー</SectionTitle>

      <div className="mt-lg grid grid-cols-1 sm:grid-cols-3 gap-lg">
        <ProductCard variant="dark">
          <Metric label="月収入" value={current.収入} delta={findDelta(comparison, '収入')} tone="dark" />
        </ProductCard>
        <ProductCard variant="dark">
          <Metric label="月支出" value={current.支出} delta={findDelta(comparison, '支出')} invertDeltaColor tone="dark" />
        </ProductCard>
        <ProductCard variant="dark">
          <Metric label="月間貯金額" value={current.貯金} delta={findDelta(comparison, '貯金')} tone="dark" />
        </ProductCard>
      </div>

      <div className="mt-lg grid grid-cols-1 sm:grid-cols-3 gap-lg">
        <ProductCard variant="dark">
          <Metric label="累計貯金額" value={current.累計貯金} tone="dark" />
        </ProductCard>
        <ProductCard variant="dark">
          <Metric label="投資総額" value={current.投資累計} tone="dark" />
        </ProductCard>
        <ProductCard variant="dark">
          <Metric label="純資産" value={current.純資産} tone="dark" />
        </ProductCard>
      </div>

      <p className="mt-md font-body text-[14px] leading-[1.8] text-mute-dark" data-testid="income-split">
        夫: {formatYen(current.夫収入)} / 妻: {formatYen(current.妻収入)} / その他: {formatYen(otherIncome)}
      </p>

      <div className="mt-xxl">
        <SectionTitle level="heading-lg">前月比較</SectionTitle>
        {comparison ? (
          <table className="mt-md w-full text-left font-body text-[14px] leading-[1.6]" data-testid="comparison-table">
            <thead>
              <tr className="border-b border-hairline-dark text-mute-dark">
                <th className="py-sm font-medium">項目</th>
                <th className="py-sm font-medium">今月</th>
                <th className="py-sm font-medium">前月</th>
                <th className="py-sm font-medium">差額</th>
                <th className="py-sm font-medium">増減率(%)</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.項目} className="border-b border-hairline-dark text-on-dark">
                  <td className="py-sm">{row.項目}</td>
                  <td className="py-sm">{formatYen(row.今月)}</td>
                  <td className="py-sm">{formatYen(row.前月)}</td>
                  <td className="py-sm">{formatYen(row.差額)}</td>
                  <td className="py-sm">{row.増減率 === null ? '—' : `${row.増減率.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-md font-body text-[13px] leading-[1.8] text-mute-dark" data-testid="no-comparison">
            前月データがありません
          </p>
        )}
      </div>
    </div>
  )
}
