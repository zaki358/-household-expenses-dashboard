/**
 * 目標達成状況の計算（Python版 src/goal.py と同じ挙動）。
 */

import { addMonths } from './dates'
import type { Goal, SummaryRow } from './aggregate'

const PACE_WINDOW_MONTHS = 6

export interface GoalStatus {
  名前: string
  目標額: number
  現在額: number
  達成率: number
  残額: number
  予想達成日: string | null
  月平均貯金: number
}

export function goalStatus(summary: SummaryRow[], goal: Goal): GoalStatus {
  const name = goal.name ?? '目標'
  const target = Number(goal.target_amount ?? 0)
  const source = goal.source ?? 'savings'

  if (summary.length === 0 || target <= 0) {
    return { 名前: name, 目標額: target, 現在額: 0, 達成率: 0, 残額: target, 予想達成日: null, 月平均貯金: 0 }
  }

  const column: keyof SummaryRow = source === 'net_worth' ? '純資産' : '累計貯金'
  const current = Number(summary[summary.length - 1][column])
  const remaining = Math.max(target - current, 0)
  const rate = Math.min(Math.max((current / target) * 100, 0), 100)

  const pace = monthlyPace(summary, source)
  const eta = estimateCompletion(summary, remaining, pace)

  return { 名前: name, 目標額: target, 現在額: current, 達成率: rate, 残額: remaining, 予想達成日: eta, 月平均貯金: pace }
}

function monthlyPace(summary: SummaryRow[], source: string): number {
  const monthly = summary.map((r) => (source === 'net_worth' ? r.貯金 + r.投資 : r.貯金))
  const recent = monthly.slice(-PACE_WINDOW_MONTHS)
  return recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0
}

function estimateCompletion(summary: SummaryRow[], remaining: number, pace: number): string | null {
  const lastMonth = summary[summary.length - 1].年月
  if (remaining <= 0) return lastMonth
  if (pace <= 0) return null
  const monthsNeeded = Math.ceil(remaining / pace)
  return addMonths(lastMonth, monthsNeeded)
}
