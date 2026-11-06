/**
 * CSV取込ロジック（Python版 src/importer.py の移植）。
 * utf-8(BOM可) → shift_jis(cp932) の順にデコード、年月/カテゴリ/金額 を検証・正規化。
 */

import type { DB } from './db'
import type { Config } from './aggregate'
import { categoryToGroup } from './repo'
import { normalizeMonth } from './dates'

const REQUIRED_COLUMNS = ['年月', 'カテゴリ', '金額']
// 任意列。無い CSV（従来形式）もそのまま通す。
const NOTE_COLUMN = '備考'

export interface Proposal { 行: number; 変更前年月: string; 年月: string; カテゴリ: string; 金額: number; 備考: string }
export interface Skipped { 行: number; 理由: string }
export interface ImportReport {
  ok: boolean
  error: string | null
  proposals: Proposal[]
  skipped: Skipped[]
  unknown_categories: string[]
}

function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes).replace(/^﻿/, '')
  } catch {
    // fall through
  }
  try {
    return new TextDecoder('shift_jis', { fatal: true, ignoreBOM: false }).decode(bytes).replace(/^﻿/, '')
  } catch {
    throw new Error('文字コードを判定できません（utf-8 / shift_jis）')
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += ch; i++
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

export function parseAmount(text: string): number | null {
  const cleaned = String(text).replace(/,/g, '').replace(/¥/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

function codePointSort(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function analyzeEntriesCsv(bytes: Uint8Array, config: Config, today?: Date): ImportReport {
  const text = decodeCsv(bytes)
  const table = parseCsv(text)
  const empty: ImportReport = { ok: false, error: null, proposals: [], skipped: [], unknown_categories: [] }

  if (table.length === 0) {
    return { ...empty, error: `必要な列がありません: ${REQUIRED_COLUMNS.join(', ')}` }
  }
  const header = table[0].map((h) => h.trim())
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c))
  if (missing.length) return { ...empty, error: `必要な列がありません: ${missing.join(', ')}` }

  const iMonth = header.indexOf('年月')
  const iCat = header.indexOf('カテゴリ')
  const iAmt = header.indexOf('金額')
  const iNote = header.indexOf(NOTE_COLUMN)
  const mapping = categoryToGroup(config)
  const proposals: Proposal[] = []
  const skipped: Skipped[] = []
  const unknown = new Set<string>()

  for (let r = 1; r < table.length; r++) {
    const line = table[r]
    if (line.length === 1 && line[0] === '') continue // 空行
    const lineNo = r + 1 // ヘッダが1行目
    const category = (line[iCat] ?? '').trim()
    const amount = parseAmount(line[iAmt] ?? '')
    const before = (line[iMonth] ?? '').trim()

    if (!category) { skipped.push({ 行: lineNo, 理由: 'カテゴリが空です' }); continue }
    if (amount === null || amount <= 0) { skipped.push({ 行: lineNo, 理由: `金額が不正です: ${JSON.stringify(line[iAmt] ?? '')}` }); continue }
    let after: string
    try { after = normalizeMonth(before, today) } catch { skipped.push({ 行: lineNo, 理由: `年月「${before}」を解釈できません` }); continue }
    if (!(category in mapping)) unknown.add(category)
    const note = iNote >= 0 ? (line[iNote] ?? '').trim() : ''
    proposals.push({ 行: lineNo, 変更前年月: before || '（空欄）', 年月: after, カテゴリ: category, 金額: amount, 備考: note })
  }

  return { ok: true, error: null, proposals, skipped, unknown_categories: [...unknown].sort(codePointSort) }
}

export async function commitEntries(db: DB, proposals: Proposal[]): Promise<number> {
  const statements: [string, unknown[]][] = proposals.map((p) => [
    "INSERT INTO entries (month, category, amount, note, source) VALUES (?, ?, ?, ?, 'import')",
    [p.年月, p.カテゴリ, p.金額, p.備考],
  ])
  if (statements.length) await db.batch(statements)
  return statements.length
}
