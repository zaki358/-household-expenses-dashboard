/**
 * 日付まわりの小さなユーティリティ。
 * 「今日」はサーバー（worker/src/dates.ts の currentMonth）と同じく JST(UTC+9) 基準で数える。
 * 端末のタイムゾーンに依存させないため、UTC に +9時間して UTC のゲッターで読む。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

function toJst(now: Date): Date {
  return new Date(now.getTime() + JST_OFFSET_MS)
}

/** JST の今月 YYYY-MM。 */
export function jstMonth(now: Date = new Date()): string {
  const jst = toJst(now)
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`
}

/** JST の今日が何日か（1〜31）。 */
export function jstDayOfMonth(now: Date = new Date()): number {
  return toJst(now).getUTCDate()
}

/** 「2026-02」→ 28 のように、その月の日数（うるう年考慮）。 */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map((x) => parseInt(x, 10))
  // 日=0 は前月末日。m は1始まりなので「翌月の0日」＝当月の末日になる。
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 「2026-09」→ 9（表示用の月番号）。 */
export function monthNumber(month: string): number {
  return parseInt(month.split('-')[1], 10)
}
