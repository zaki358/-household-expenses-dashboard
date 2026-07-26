/**
 * 年月(YYYY-MM)の正規化・加算（Python版 src/dates.py と同じ挙動）。
 */

function pad(n: number, width: number): string {
  return Math.abs(n).toString().padStart(width, '0')
}

export function isBlank(value: unknown): boolean {
  const t = String(value ?? '').trim().toLowerCase()
  return t === '' || t === 'nan'
}

export function normalizeMonth(value: unknown, today: Date = new Date()): string {
  const text = String(value ?? '').trim()
  if (isBlank(text)) {
    return `${pad(today.getFullYear(), 4)}-${pad(today.getMonth() + 1, 2)}`
  }
  if (/^\d+$/.test(text)) {
    const n = parseInt(text, 10)
    if (n >= 1 && n <= 12) {
      return `${pad(today.getFullYear(), 4)}-${pad(n, 2)}`
    }
  }
  const normalized = text
    .replace(/年/g, '-')
    .replace(/月/g, '')
    .replace(/\//g, '-')
    .replace(/^-+|-+$/g, '')
  const parts = normalized.split('-').filter((p) => p !== '')
  if (parts.length === 0) throw new Error(`年月を解釈できません: ${String(value)}`)
  const year = parseInt(parts[0], 10)
  if (Number.isNaN(year)) throw new Error(`年月を解釈できません: ${String(value)}`)
  const month = parts.length > 1 ? parseInt(parts[1], 10) : 1
  if (Number.isNaN(month) || month < 1 || month > 12) {
    throw new Error(`月が範囲外です: ${String(value)}`)
  }
  return `${pad(year, 4)}-${pad(month, 2)}`
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.trim().split('-').slice(0, 2).map((x) => parseInt(x, 10))
  const index = y * 12 + (m - 1) + n
  const newYear = Math.floor(index / 12)
  const newMon = index - newYear * 12 // 0..11
  return `${pad(newYear, 4)}-${pad(newMon + 1, 2)}`
}

export function nextMonth(month: string): string {
  return addMonths(month, 1)
}
