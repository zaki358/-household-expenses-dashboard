import { useEffect, useState } from 'react'
import { getGoalStatus } from '../../api/client'
import type { GoalStatus } from '../../api/types'
import { SectionTitle } from '../../components/SectionTitle'
import { formatYen } from '../../utils/currency'

const PACE_WINDOW_MONTHS = 3

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 100)
  return (
    <div className="w-full rounded-full bg-surface-dark-elevated overflow-hidden h-[6px]">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
}

interface KpiProps {
  label: string
  value: string
}

function Kpi({ label, value }: KpiProps) {
  return (
    <div className="flex flex-col gap-xxs">
      <p className="font-body text-[12px] leading-[1.8] text-mute-dark uppercase tracking-widest">{label}</p>
      <p className="font-display font-light text-[24px] leading-[1.25] text-on-dark">{value}</p>
    </div>
  )
}

export function GoalTab() {
  const [status, setStatus] = useState<GoalStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getGoalStatus()
      .then(setStatus)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'エラーが発生しました'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="font-body text-[14px] text-mute-dark">読み込み中...</p>
  if (error) return <p className="font-body text-[14px] text-warning">{error}</p>

  if (!status) {
    return (
      <p className="font-body text-[14px] text-mute-dark">
        目標が設定されていません。設定タブで目標を追加してください。
      </p>
    )
  }

  if (status.目標額 <= 0) {
    return (
      <div>
        <SectionTitle level="heading-xl" className="text-on-dark">🎯 {status.名前}</SectionTitle>
        <p className="mt-md font-body text-[14px] text-warning">
          目標額が設定されていません。設定タブで目標額を入力してください。
        </p>
      </div>
    )
  }

  const achieveLabel = status.残額 <= 0 ? '達成済み 🎉' : (status.予想達成日 ?? '—')

  return (
    <div>
      <SectionTitle level="heading-xl" className="text-on-dark">🎯 {status.名前}</SectionTitle>

      <div className="mt-lg">
        <div className="flex justify-between items-center mb-sm">
          <span className="font-body text-[13px] text-mute-dark">達成率</span>
          <span className="font-body text-[20px] font-light text-primary">{status.達成率.toFixed(1)}%</span>
        </div>
        <ProgressBar value={status.達成率} />
      </div>

      <div className="mt-xl grid grid-cols-2 sm:grid-cols-4 gap-lg border-t border-hairline-dark pt-lg">
        <Kpi label="目標額" value={formatYen(status.目標額)} />
        <Kpi label="現在額" value={formatYen(status.現在額)} />
        <Kpi label="残額" value={formatYen(status.残額)} />
        <Kpi label="予想達成日" value={achieveLabel} />
      </div>

      {status.残額 > 0 && !status.予想達成日 && (
        <p className="mt-md font-body text-[13px] text-warning">
          直近の積み上げペースがマイナスのため、達成日を予測できません。
        </p>
      )}

      <p className="mt-lg font-body text-[12px] leading-[1.8] text-mute-dark">
        現在額は<strong className="text-on-dark">累計貯金額</strong>をもとに算出。予想達成日は直近{' '}
        {PACE_WINDOW_MONTHS} ヶ月の平均ペース（{formatYen(status.月平均貯金)}/月）で計算しています。
      </p>
    </div>
  )
}
