/**
 * 全 SQL アクセスを集約するリポジトリ層（Python版 src/repo.py の移植）。
 */

import type { DB } from './db'
import type { Config, DatasetRow, Goal } from './aggregate'
import { currentMonth, daysInMonth, normalizeMonth, nextMonth } from './dates'

/** 検証エラー（ルートで 400 に変換する）。 */
export class ValidationError extends Error {}

export interface EntryRow {
  id: number
  年月: string
  カテゴリ: string
  金額: number
  備考: string
  日: number | null
  /** 割り勘アプリへ反映済みの場合、その支出ID。未反映は null。 */
  割り勘ID: string | null
}
export interface BundleItemRow { id: number; 年月: string; 名前: string; 金額: number }

interface BundleSpec { key: string; label: string; group: string }
export const ALL_BUNDLES: BundleSpec[] = [
  { key: 'subscriptions', label: 'サブスク', group: '固定費' },
  { key: 'communications', label: '通信費', group: '通信費' },
]
const FIXED_COST_GROUP = '固定費'

function codePointSort(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function categoryToGroup(config: Config): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const [group, cats] of Object.entries(config.categories)) {
    for (const c of cats) mapping[c] = group
  }
  return mapping
}

// --------------------------------------------------------------------------- //
// config
// --------------------------------------------------------------------------- //
type GroupRow = { name: string }
type CategoryRow = { name: string; group_name: string; income_owner: string | null }
type SettingRow = { key: string; value: string | null }
type GoalRow = { name: string; target_amount: number; source: string }
type MonthRow = { month: string }
type UsageRow = { category: string; c: number }

/** カテゴリ使用件数の行を {カテゴリ名: 件数} に畳む（SQLを知らない純関数）。 */
function usageFromRows(rows: UsageRow[]): Record<string, number> {
  const usage: Record<string, number> = {}
  for (const r of rows) usage[r.category] = Number(r.c)
  return usage
}

/** config 系5クエリの結果からConfigを組み立てる（SQLを知らない純関数）。 */
function assembleConfig(
  groups: GroupRow[],
  cats: CategoryRow[],
  settingsRows: SettingRow[],
  goalsRows: GoalRow[],
  dashboardMonthRows: MonthRow[],
): Config {
  const categories: Record<string, string[]> = {}
  for (const g of groups) categories[g.name] = []
  const income_owner: Record<string, string> = {}
  for (const c of cats) {
    ;(categories[c.group_name] ??= []).push(c.name)
    if (c.income_owner) income_owner[c.name] = c.income_owner
  }

  const settings = new Map(settingsRows.map((s) => [s.key, s.value]))
  const rawInvest = settings.get('investment_as_expense')
  const invest = rawInvest == null ? true : String(rawInvest).toLowerCase() === 'true'

  const goals: Goal[] = goalsRows.map((g) => ({
    name: g.name, target_amount: g.target_amount, source: g.source as 'savings' | 'net_worth',
  }))
  const months = dashboardMonthRows.map((r) => r.month)

  return {
    categories,
    income_owner,
    investment_as_expense: invest,
    goals,
    active_goal: settings.get('active_goal') ?? null,
    dashboard_months: months,
  }
}

/** config を組み立てるのに必要な5本。並び順は assembleConfig の引数順と対応する。 */
const CONFIG_QUERIES: [string, unknown[]][] = [
  ['SELECT name FROM category_groups ORDER BY sort_order, name', []],
  ['SELECT name, group_name, income_owner FROM categories ORDER BY sort_order, name', []],
  ['SELECT key, value FROM app_settings', []],
  ['SELECT name, target_amount, source FROM goals ORDER BY sort_order, name', []],
  ['SELECT month FROM dashboard_months ORDER BY month', []],
]

/** CONFIG_QUERIES を batchAll した結果（先頭5要素）から Config を組み立てる。 */
function configFromBatch(results: unknown[][]): Config {
  return assembleConfig(
    results[0] as GroupRow[],
    results[1] as CategoryRow[],
    results[2] as SettingRow[],
    results[3] as GoalRow[],
    results[4] as MonthRow[],
  )
}

/** D1への往復を1回にまとめて config を取得する（5クエリを batchAll で同時実行）。 */
export async function loadConfig(db: DB): Promise<Config> {
  return configFromBatch(await db.batchAll(CONFIG_QUERIES))
}

const USAGE_QUERY: [string, unknown[]] = [
  'SELECT category, COUNT(*) AS c FROM entries GROUP BY category',
  [],
]

/**
 * config とカテゴリ使用件数を D1 への1往復で取得する（/api/config 用）。
 * loadConfig と categoryUsage を別々に呼ぶと往復が2回になるため、同じ batchAll に載せる。
 */
export async function loadConfigWithUsage(db: DB): Promise<{ config: Config; usage: Record<string, number> }> {
  const results = await db.batchAll([...CONFIG_QUERIES, USAGE_QUERY])
  return {
    config: configFromBatch(results),
    usage: usageFromRows(results[CONFIG_QUERIES.length] as UsageRow[]),
  }
}

// --------------------------------------------------------------------------- //
// dataset（集計用）
// --------------------------------------------------------------------------- //
type EntryRawRow = { month: string; category: string; amount: number }
type BundleTotalRow = { month: string; total: number | null }

/** entries・バンドル月次合計の結果からデータセットを組み立てる（SQLを知らない純関数）。 */
function assembleDataset(
  cfg: Config,
  entryRows: EntryRawRow[],
  bundleTotalsByKey: Map<string, BundleTotalRow[]>,
): { rows: DatasetRow[]; warnings: string[] } {
  const mapping = categoryToGroup(cfg)
  const warnings: string[] = []
  const rows: DatasetRow[] = []
  const unknown = new Set<string>()

  for (const e of entryRows) {
    let group = mapping[e.category]
    if (group === undefined) {
      unknown.add(e.category)
      group = '未分類'
    }
    rows.push({ 年月: e.month, カテゴリ: e.category, 金額: e.amount, グループ: group })
  }

  for (const spec of ALL_BUNDLES) {
    const monthly = bundleTotalsByKey.get(spec.key) ?? []
    for (const row of monthly) {
      const total = row.total
      if (!total || total <= 0) continue
      rows.push({ 年月: row.month, カテゴリ: spec.label, 金額: total, グループ: spec.group })
    }
  }

  if (unknown.size) {
    warnings.push(
      `未登録カテゴリを「未分類」として支出扱いにしました: ${[...unknown].sort(codePointSort).join(', ')}（設定画面から追加できます）`,
    )
  }
  return { rows, warnings }
}

export async function loadDataset(db: DB, config?: Config): Promise<{ rows: DatasetRow[]; warnings: string[] }> {
  const cfg = config ?? (await loadConfig(db))
  const entryRows = await db.all<EntryRawRow>('SELECT month, category, amount FROM entries ORDER BY id')
  const bundleTotalsByKey = new Map<string, BundleTotalRow[]>()
  for (const spec of ALL_BUNDLES) {
    const monthly = await db.all<BundleTotalRow>(
      'SELECT month, SUM(amount) AS total FROM bundle_items WHERE kind = ? GROUP BY month',
      [spec.key],
    )
    bundleTotalsByKey.set(spec.key, monthly)
  }
  return assembleDataset(cfg, entryRows, bundleTotalsByKey)
}

export async function allMonths(db: DB): Promise<string[]> {
  const rows = await db.all<{ month: string }>(
    'SELECT month FROM entries UNION SELECT month FROM bundle_items UNION SELECT month FROM dashboard_months',
  )
  return rows.map((r) => r.month).sort(codePointSort)
}

// --------------------------------------------------------------------------- //
// state（config + dataset + all months をまとめて取得）
// --------------------------------------------------------------------------- //
/**
 * loadState が1往復（batchAll）で投げる SELECT 群。
 * 構成: CONFIG_QUERIES(5本) → entries → バンドル(ALL_BUNDLES順) → allMonths。
 * 分解は下の loadState 側で長さから算出するので、添字をハードコードしないこと。
 */
function buildStateQueries(): [string, unknown[]][] {
  return [
    ...CONFIG_QUERIES,
    ['SELECT month, category, amount FROM entries ORDER BY id', []],
    ...ALL_BUNDLES.map((s): [string, unknown[]] => [
      'SELECT month, SUM(amount) AS total FROM bundle_items WHERE kind = ? GROUP BY month',
      [s.key],
    ]),
    ['SELECT month FROM entries UNION SELECT month FROM bundle_items UNION SELECT month FROM dashboard_months', []],
  ]
}

/**
 * config・データセット・全月を D1 への1往復（batchAll）で取得する。
 * /api/summary /api/dashboard /api/charts が共通で使う読み取りをまとめ、
 * loadConfig→loadDataset→allMonths を逐次呼ぶ場合の9往復を1往復に減らす。
 */
export async function loadState(db: DB): Promise<{
  config: Config; rows: DatasetRow[]; warnings: string[]; months: string[]
}> {
  const results = await db.batchAll(buildStateQueries())
  const entriesAt = CONFIG_QUERIES.length
  const bundlesAt = entriesAt + 1
  const monthsAt = bundlesAt + ALL_BUNDLES.length

  const config = configFromBatch(results)
  const bundleTotalsByKey = new Map<string, BundleTotalRow[]>()
  ALL_BUNDLES.forEach((spec, i) =>
    bundleTotalsByKey.set(spec.key, (results[bundlesAt + i] ?? []) as BundleTotalRow[]),
  )
  const { rows, warnings } = assembleDataset(config, results[entriesAt] as EntryRawRow[], bundleTotalsByKey)
  const months = ((results[monthsAt] ?? []) as MonthRow[]).map((r) => r.month).sort(codePointSort)

  return { config, rows, warnings, months }
}

// --------------------------------------------------------------------------- //
// entries CRUD（手入力 = source='manual' のみ編集対象）
// --------------------------------------------------------------------------- //
function validateAmount(amount: unknown): number {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) throw new ValidationError('金額は数値で入力してください')
  const v = Math.trunc(n)
  if (v <= 0) throw new ValidationError('金額は1以上で入力してください')
  return v
}

interface EntryDbRow {
  id: number
  month: string
  category: string
  amount: number
  note: string
  day: number | null
  warikan_expense_id: string | null
}

const toEntryRow = (r: EntryDbRow): EntryRow => ({
  id: r.id,
  年月: r.month,
  カテゴリ: r.category,
  金額: r.amount,
  備考: r.note,
  日: r.day,
  割り勘ID: r.warikan_expense_id,
})

export async function listEntries(db: DB, month?: string | null, group?: string | null, config?: Config): Promise<EntryRow[]> {
  // entries の取得と（group絞り込みに要る）config の取得は互いに独立なので同時に投げる。
  const [raw, cfg] = await Promise.all([
    db.all<EntryDbRow>(
      "SELECT id, month, category, amount, note, day, warikan_expense_id FROM entries WHERE source = 'manual' ORDER BY id",
    ),
    group != null ? (config ?? loadConfig(db)) : Promise.resolve(null),
  ])
  let out: EntryRow[] = raw.map(toEntryRow)
  if (month != null) out = out.filter((r) => r.年月 === month)
  if (group != null && cfg !== null) {
    const mapping = categoryToGroup(cfg)
    out = out.filter((r) => mapping[r.カテゴリ] === group)
  }
  return out
}

/**
 * 1件を取得する。割り勘アプリへの反映で 年月・カテゴリ・金額・備考・日・反映状態が必要になるため、
 * listEntries の全件取得とは別に用意している。
 */
export async function findEntryById(db: DB, id: number): Promise<EntryRow | null> {
  const rows = await db.all<EntryDbRow>(
    "SELECT id, month, category, amount, note, day, warikan_expense_id FROM entries WHERE id = ? AND source = 'manual'",
    [id],
  )
  return rows.length > 0 ? toEntryRow(rows[0]) : null
}

/** 割り勘アプリへの反映先IDを記録する。null を渡すと「未反映」に戻す（反映の取り消し）。 */
export async function setWarikanExpenseId(db: DB, id: number, expenseId: string | null): Promise<void> {
  await db.run("UPDATE entries SET warikan_expense_id = ? WHERE id = ? AND source = 'manual'", [expenseId, id])
}

export async function entryExists(db: DB, id: number): Promise<boolean> {
  const rows = await db.all("SELECT 1 FROM entries WHERE id = ? AND source = 'manual'", [id])
  return rows.length > 0
}

/** 日（任意）を検証する。null/undefined は「日付なし」。1〜その月の末日の整数のみ許可。 */
function validateDay(day: unknown, month: string): number | null {
  if (day === null || day === undefined) return null
  if (typeof day !== 'number' || !Number.isInteger(day)) throw new ValidationError('日は整数で入力してください')
  const last = daysInMonth(month)
  if (day < 1 || day > last) throw new ValidationError(`日は1〜${last}の範囲で入力してください`)
  return day
}

export async function addEntry(
  db: DB,
  config: Config,
  month: unknown,
  category: unknown,
  amount: unknown,
  note?: unknown,
  day?: unknown,
): Promise<EntryRow[]> {
  let normalizedMonth: string
  try {
    normalizedMonth = normalizeMonth(month)
  } catch {
    throw new ValidationError('年月の形式が不正です（例: 2026-06）')
  }
  const cat = String(category).trim()
  if (!(cat in categoryToGroup(config))) throw new ValidationError(`カテゴリ「${cat}」は登録されていません`)
  const value = validateAmount(amount)
  const cleanNote = String(note ?? '').trim()
  const cleanDay = validateDay(day, normalizedMonth)
  await db.run(
    "INSERT INTO entries (month, category, amount, note, day, source) VALUES (?, ?, ?, ?, ?, 'manual')",
    [normalizedMonth, cat, value, cleanNote, cleanDay],
  )
  return listEntries(db)
}

/**
 * 金額に加え、カテゴリ・備考・日も更新できる。category/note/day が undefined の場合はその列に触らない
 * （{ amount } だけの旧呼び出しとの後方互換のため）。note に空文字・day に null を渡すのは「クリア」扱い。
 */
export async function updateEntry(
  db: DB,
  config: Config,
  id: number,
  amount: unknown,
  category?: string,
  note?: string,
  day?: unknown,
): Promise<EntryRow[]> {
  const value = validateAmount(amount)
  const sets: string[] = ['amount = ?']
  const params: unknown[] = [value]

  if (category !== undefined) {
    const cat = category.trim()
    if (!(cat in categoryToGroup(config))) throw new ValidationError(`カテゴリ「${cat}」は登録されていません`)
    sets.push('category = ?')
    params.push(cat)
  }
  if (note !== undefined) {
    sets.push('note = ?')
    params.push(note.trim())
  }
  if (day !== undefined) {
    const rows = await db.all<{ month: string }>('SELECT month FROM entries WHERE id = ?', [id])
    if (rows.length > 0) {
      sets.push('day = ?')
      params.push(validateDay(day, rows[0].month))
    }
  }

  params.push(id)
  await db.run(`UPDATE entries SET ${sets.join(', ')} WHERE id = ? AND source = 'manual'`, params)
  return listEntries(db)
}

export async function deleteEntry(db: DB, id: number): Promise<EntryRow[]> {
  await db.run("DELETE FROM entries WHERE id = ? AND source = 'manual'", [id])
  return listEntries(db)
}

// --------------------------------------------------------------------------- //
// bundles CRUD
// --------------------------------------------------------------------------- //
export async function listBundleItems(db: DB, kind: string, month?: string | null): Promise<BundleItemRow[]> {
  const raw = await db.all<{ id: number; month: string; name: string; amount: number }>(
    'SELECT id, month, name, amount FROM bundle_items WHERE kind = ? ORDER BY id',
    [kind],
  )
  let out: BundleItemRow[] = raw.map((r) => ({ id: r.id, 年月: r.month, 名前: r.name, 金額: r.amount }))
  if (month != null) out = out.filter((r) => r.年月 === month)
  return out
}

export async function bundleItemExists(db: DB, id: number, kind: string): Promise<boolean> {
  const rows = await db.all('SELECT 1 FROM bundle_items WHERE id = ? AND kind = ?', [id, kind])
  return rows.length > 0
}

export async function addBundleItem(db: DB, kind: string, month: unknown, name: unknown, amount: unknown): Promise<BundleItemRow[]> {
  const cleanMonth = String(month).trim()
  const cleanName = String(name).trim()
  if (!cleanName) throw new ValidationError('名前が空です')
  const value = validateAmount(amount)
  const existing = await db.all('SELECT 1 FROM bundle_items WHERE kind = ? AND month = ? AND name = ?', [kind, cleanMonth, cleanName])
  if (existing.length) throw new ValidationError(`「${cleanName}」は${cleanMonth}にすでに登録されています`)
  await db.run('INSERT INTO bundle_items (kind, month, name, amount) VALUES (?, ?, ?, ?)', [kind, cleanMonth, cleanName, value])
  return listBundleItems(db, kind)
}

/**
 * 金額に加え、項目名も更新できる。name が undefined ならその列に触らない
 * （{ amount } だけの旧呼び出しとの後方互換のため）。
 */
export async function updateBundleItem(db: DB, kind: string, id: number, amount: unknown, name?: string): Promise<BundleItemRow[]> {
  const value = validateAmount(amount)

  if (name !== undefined) {
    const cleanName = name.trim()
    if (!cleanName) throw new ValidationError('名前が空です')
    const row = await db.all<{ month: string }>('SELECT month FROM bundle_items WHERE id = ? AND kind = ?', [id, kind])
    if (row.length) {
      const month = row[0].month
      const dup = await db.all(
        'SELECT 1 FROM bundle_items WHERE kind = ? AND month = ? AND name = ? AND id != ?',
        [kind, month, cleanName, id],
      )
      if (dup.length) throw new ValidationError(`「${cleanName}」は${month}にすでに登録されています`)
    }
    await db.run('UPDATE bundle_items SET amount = ?, name = ? WHERE id = ? AND kind = ?', [value, cleanName, id, kind])
    return listBundleItems(db, kind)
  }

  await db.run('UPDATE bundle_items SET amount = ? WHERE id = ? AND kind = ?', [value, id, kind])
  return listBundleItems(db, kind)
}

export async function deleteBundleItem(db: DB, kind: string, id: number): Promise<BundleItemRow[]> {
  await db.run('DELETE FROM bundle_items WHERE id = ? AND kind = ?', [id, kind])
  return listBundleItems(db, kind)
}

// --------------------------------------------------------------------------- //
// goals
// --------------------------------------------------------------------------- //
const GOAL_SOURCES = new Set(['savings', 'net_worth'])

export async function listGoals(db: DB): Promise<Goal[]> {
  const rows = await db.all<{ name: string; target_amount: number; source: string }>(
    'SELECT name, target_amount, source FROM goals ORDER BY sort_order, name',
  )
  return rows.map((g) => ({ name: g.name, target_amount: g.target_amount, source: g.source as 'savings' | 'net_worth' }))
}

export async function getActiveGoal(db: DB, config?: Config): Promise<Goal | null> {
  const cfg = config ?? (await loadConfig(db))
  const goals = cfg.goals
  if (goals.length === 0) return null
  const name = cfg.active_goal
  return goals.find((g) => g.name === name) ?? goals[0]
}

async function nextGoalSortOrder(db: DB): Promise<number> {
  const rows = await db.all<{ m: number }>('SELECT COALESCE(MAX(sort_order), -1) AS m FROM goals')
  return Number(rows[0].m) + 1
}

export async function addGoal(db: DB, name: unknown, targetAmount: unknown, source = 'savings'): Promise<Goal[]> {
  const clean = String(name).trim()
  if (!clean) throw new ValidationError('目標名が空です')
  const target = typeof targetAmount === 'number' ? targetAmount : Number(targetAmount)
  if (!Number.isFinite(target)) throw new ValidationError('目標額は数値で入力してください')
  const t = Math.trunc(target)
  if (t <= 0) throw new ValidationError('目標額は1以上で入力してください')
  if (!GOAL_SOURCES.has(source)) throw new ValidationError(`不明な算出元です: ${source}`)
  if ((await db.all('SELECT 1 FROM goals WHERE name = ?', [clean])).length) throw new ValidationError(`目標「${clean}」はすでに存在します`)
  await db.run('INSERT INTO goals (name, target_amount, source, sort_order) VALUES (?, ?, ?, ?)', [clean, t, source, await nextGoalSortOrder(db)])
  return listGoals(db)
}

export async function removeGoal(db: DB, name: string): Promise<Goal[]> {
  await db.run('DELETE FROM goals WHERE name = ?', [name])
  const active = await db.all<{ value: string | null }>("SELECT value FROM app_settings WHERE key = 'active_goal'")
  if (active.length && active[0].value === name) await db.run("DELETE FROM app_settings WHERE key = 'active_goal'")
  return listGoals(db)
}

export async function setActiveGoal(db: DB, name: string): Promise<Goal[]> {
  if (!(await db.all('SELECT 1 FROM goals WHERE name = ?', [name])).length) throw new ValidationError(`目標「${name}」が存在しません`)
  await setSetting(db, 'active_goal', name)
  return listGoals(db)
}

// --------------------------------------------------------------------------- //
// categories / settings
// --------------------------------------------------------------------------- //
async function setSetting(db: DB, key: string, value: string): Promise<void> {
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  )
}

export async function setInvestmentMode(db: DB, investmentAsExpense: boolean): Promise<void> {
  await setSetting(db, 'investment_as_expense', investmentAsExpense ? 'true' : 'false')
}

export async function addCategory(db: DB, group: string, name: string, config?: Config): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new ValidationError('カテゴリ名が空です')
  const cfg = config ?? (await loadConfig(db))
  if (!(group in cfg.categories)) throw new ValidationError(`不明なグループです: ${group}`)
  if (clean in categoryToGroup(cfg)) throw new ValidationError(`カテゴリ「${clean}」はすでに存在します`)
  const rows = await db.all<{ m: number }>('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE group_name = ?', [group])
  await db.run('INSERT INTO categories (name, group_name, income_owner, sort_order) VALUES (?, ?, NULL, ?)', [clean, group, Number(rows[0].m) + 1])
}

export async function categoryUsage(db: DB): Promise<Record<string, number>> {
  return usageFromRows(await db.all<UsageRow>(USAGE_QUERY[0]))
}

export async function removeCategory(db: DB, name: string, config?: Config): Promise<void> {
  const clean = name.trim()
  const cfg = config ?? (await loadConfig(db))
  if (!(clean in categoryToGroup(cfg))) throw new ValidationError(`カテゴリ「${clean}」は存在しません`)
  if (clean in cfg.income_owner) throw new ValidationError(`「${clean}」は夫婦の収入内訳の集計に使う特別なカテゴリのため削除できません`)
  if (ALL_BUNDLES.some((spec) => spec.label === clean)) throw new ValidationError(`「${clean}」は入力タブのサブスク／通信費の集計に使うため削除できません`)
  const used = (await categoryUsage(db))[clean] ?? 0
  if (used) throw new ValidationError(`「${clean}」は実績データ${used}件で使用中のため削除できません。先に該当データを修正または削除してください`)
  await db.run('DELETE FROM categories WHERE name = ?', [clean])
}

// --------------------------------------------------------------------------- //
// 月の準備（固定費・バンドルの引き継ぎ）— ensureMonth / ensureCurrentMonth / createNextMonth
// --------------------------------------------------------------------------- //

/**
 * target より前で実データ（entries または bundle_items）を持つ最新月。無ければ null。
 * dashboard_months は意図的にUNIONしない — 迷子の未来月や中身が空の準備済み月が
 * base に選ばれるのを防ぐため（前者は allMonths() の最大値を base にすると起きる事故、
 * 後者は「準備はしたが引き継ぐものが無かった月」を base にすると何も引き継がれない事故）。
 */
export async function previousDataMonth(db: DB, target: string): Promise<string | null> {
  const rows = await db.all<{ m: string | null }>(
    `SELECT MAX(month) AS m FROM (
       SELECT month FROM entries WHERE month < ?
       UNION
       SELECT month FROM bundle_items WHERE month < ?
     )`,
    [target, target],
  )
  return rows[0]?.m ?? null
}

export interface EnsureMonthResult {
  month: string
  created: boolean
  base: string | null
  carried_entries: number
  carried_bundle_items: number
}

/**
 * 指定した月(month)を準備する: 直前の実データ月から固定費・サブスク・通信費を引き継ぎ、
 * dashboard_months に登録する。既に登録済みなら何もせず {created: false} を返す（冪等）。
 * このマーカーが「準備後に手動で全部消しても再度引き継がれない」ことを保証する
 * （allMonths() は dashboard_months をUNIONするため、その月は summary.months に残り続け、
 * 呼び出し側の「今月がまだ無い」判定が再び真になることはない）。
 *
 * createNextMonth と将来の自動準備トリガーが共有する唯一の実装。
 */
export async function ensureMonth(db: DB, month: unknown, config?: Config): Promise<EnsureMonthResult> {
  let target: string
  try {
    target = normalizeMonth(month)
  } catch {
    throw new ValidationError('年月の形式が不正です（例: 2026-08）')
  }

  const already = await db.all('SELECT 1 FROM dashboard_months WHERE month = ? LIMIT 1', [target])
  if (already.length) {
    return { month: target, created: false, base: null, carried_entries: 0, carried_bundle_items: 0 }
  }

  const base = await previousDataMonth(db, target)
  const statements: [string, unknown[]][] = []
  let carriedEntries = 0
  let carriedBundleItems = 0

  if (base !== null) {
    const cfg = config ?? (await loadConfig(db))
    const mapping = categoryToGroup(cfg)
    const fixedCats = Object.keys(mapping).filter((c) => mapping[c] === FIXED_COST_GROUP)

    // 固定費エントリの引き継ぎ（対象月に固定費が無いときだけ）
    if (fixedCats.length) {
      const placeholders = fixedCats.map(() => '?').join(',')
      const alreadyFixed = await db.all(
        `SELECT 1 FROM entries WHERE month = ? AND category IN (${placeholders}) LIMIT 1`,
        [target, ...fixedCats],
      )
      if (!alreadyFixed.length) {
        const baseFixed = await db.all<{ category: string; amount: number; note: string }>(
          `SELECT category, amount, note FROM entries WHERE month = ? AND category IN (${placeholders}) ORDER BY id`,
          [base, ...fixedCats],
        )
        for (const row of baseFixed) {
          statements.push([
            "INSERT INTO entries (month, category, amount, note, source) VALUES (?, ?, ?, ?, 'manual')",
            [target, row.category, row.amount, row.note],
          ])
          carriedEntries++
        }
      }
    }

    // サブスク・通信費の引き継ぎ（対象月に項目が無いときだけ）
    for (const spec of ALL_BUNDLES) {
      const hasTarget = await db.all('SELECT 1 FROM bundle_items WHERE kind = ? AND month = ? LIMIT 1', [spec.key, target])
      if (hasTarget.length) continue
      const baseItems = await db.all<{ name: string; amount: number }>(
        'SELECT name, amount FROM bundle_items WHERE kind = ? AND month = ? ORDER BY id',
        [spec.key, base],
      )
      for (const row of baseItems) {
        statements.push([
          // UNIQUE (kind, month, name) があるため OR IGNORE で途中失敗後の再試行を安全にする
          'INSERT OR IGNORE INTO bundle_items (kind, month, name, amount) VALUES (?, ?, ?, ?)',
          [spec.key, target, row.name, row.amount],
        ])
        carriedBundleItems++
      }
    }
  }

  statements.push(['INSERT OR IGNORE INTO dashboard_months (month) VALUES (?)', [target]])
  // 1トランザクションにまとめ、「半分だけ引き継がれた月」が起きないようにする
  await db.batch(statements)

  return { month: target, created: true, base, carried_entries: carriedEntries, carried_bundle_items: carriedBundleItems }
}

/**
 * 今月(JST)を準備する。データが一件も無い完全な初回起動では何もしない
 * （base が無いので引き継ぐ物も無く、marker だけ書くのを避けて空状態のオンボーディングを保つ）。
 */
export async function ensureCurrentMonth(db: DB, config?: Config, today?: string): Promise<EnsureMonthResult> {
  const target = today ?? currentMonth()
  const months = await allMonths(db)
  if (months.length === 0) {
    return { month: target, created: false, base: null, carried_entries: 0, carried_bundle_items: 0 }
  }
  return ensureMonth(db, target, config)
}

/** 翌月を作成し、作成した月(YYYY-MM)を返す（設定タブの「➕ 翌月を作成」ボタン用）。 */
export async function createNextMonth(db: DB, config?: Config): Promise<string> {
  const months = await allMonths(db)
  if (months.length === 0) throw new ValidationError('基準となる月がありません。先に当月のデータを入力してください。')
  const target = nextMonth(months[months.length - 1])
  const result = await ensureMonth(db, target, config)
  return result.month
}

// --------------------------------------------------------------------------- //
// 月削除（誤って作成した翌月シートの取り消し用）
// --------------------------------------------------------------------------- //
export interface DeleteMonthResult { month: string; deleted_entries: number; deleted_bundle_items: number }

/**
 * 指定した月の entries・bundle_items・dashboard_months をまとめて削除する。
 * 「1つの月」はこの3テーブルに分散しており外部キーも無いため、3つとも消さないと
 * allMonths()（UNION）にその月が残ってしまう。D1 の batch は単一トランザクションなので、
 * ここに乗せることで一部だけ消える事故を防ぐ。
 *
 * 中間の月を消すと monthlySummary の累計（貯金・投資・純資産）が以降の全月でズレるため、
 * 「今月より後」の月のみ許可する。今月判定は Worker が UTC で動くことを踏まえ、
 * 呼び出し側から currentMonth() を渡すのを既定とする（テストでは任意の today を注入できる）。
 * source（manual/import）は問わず、その月の行はすべて削除する
 * （source='manual' に絞ると import 行が残り「消したのに月が消えない」事故になる）。
 */
export async function deleteMonth(db: DB, month: unknown, today?: string): Promise<DeleteMonthResult> {
  let target: string
  try {
    target = normalizeMonth(month)
  } catch {
    throw new ValidationError('年月の形式が不正です（例: 2026-08）')
  }
  const current = today ?? currentMonth()
  // YYYY-MM は辞書順=時系列順で比較できる
  if (target <= current) {
    throw new ValidationError(`${target} は削除できません。今月(${current})より後の月のみ削除できます。`)
  }

  const counts = await db.batchAll([
    ['SELECT COUNT(*) AS c FROM entries WHERE month = ?', [target]],
    ['SELECT COUNT(*) AS c FROM bundle_items WHERE month = ?', [target]],
  ])
  const deletedEntries = Number((counts[0][0] as { c: number } | undefined)?.c ?? 0)
  const deletedBundleItems = Number((counts[1][0] as { c: number } | undefined)?.c ?? 0)

  await db.batch([
    ['DELETE FROM entries WHERE month = ?', [target]],
    ['DELETE FROM bundle_items WHERE month = ?', [target]],
    ['DELETE FROM dashboard_months WHERE month = ?', [target]],
  ])

  return { month: target, deleted_entries: deletedEntries, deleted_bundle_items: deletedBundleItems }
}
