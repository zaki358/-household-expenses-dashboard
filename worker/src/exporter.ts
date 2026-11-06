/**
 * D1 → CSV 書き出し（Python版 src/exporter.py の移植）。
 * レガシーと同じヘッダ。改行は CRLF、QUOTE_MINIMAL。
 */

import type { DB } from './db'

function escapeField(value: unknown): string {
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header: string[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(escapeField).join(','))
  return lines.join('\r\n') + '\r\n'
}

export async function exportEntriesCsv(db: DB): Promise<string> {
  const rows = await db.all<{ month: string; category: string; amount: number; note: string }>(
    'SELECT month, category, amount, note FROM entries ORDER BY month, id',
  )
  return toCsv(['年月', 'カテゴリ', '金額', '備考'], rows.map((r) => [r.month, r.category, r.amount, r.note]))
}

export async function exportBundleCsv(db: DB, kind: string): Promise<string> {
  const rows = await db.all<{ month: string; name: string; amount: number }>(
    'SELECT month, name, amount FROM bundle_items WHERE kind = ? ORDER BY month, id',
    [kind],
  )
  return toCsv(['年月', '名前', '金額'], rows.map((r) => [r.month, r.name, r.amount]))
}
