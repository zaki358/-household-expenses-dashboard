/**
 * 全 SQL アクセスを集約するリポジトリ層（Python版 src/repo.py の移植）。
 */

import type { DB } from './db'
import type { Config, DatasetRow, Goal } from './aggregate'
import { normalizeMonth, nextMonth } from './dates'

/** 検証エラー（ルートで 400 に変換する）。 */
export class ValidationError extends Error {}

export interface EntryRow { id: number; 年月: string; カテゴリ: string; 金額: number }
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
export async function loadConfig(db: DB): Promise<Config> {
  const groups = await db.all<{ name: string }>('SELECT name FROM category_groups ORDER BY sort_order, name')
  const cats = await db.all<{ name: string; group_name: string; income_owner: string | null }>(
    'SELECT name, group_name, income_owner FROM categories ORDER BY sort_order, name',
  )
  const categories: Record<string, string[]> = {}
  for (const g of groups) categories[g.name] = []
  const income_owner: Record<string, string> = {}
  for (const c of cats) {
    ;(categories[c.group_name] ??= []).push(c.name)
    if (c.income_owner) income_owner[c.name] = c.income_owner
  }

  const settingsRows = await db.all<{ key: string; value: string | null }>('SELECT key, value FROM app_settings')
  const settings = new Map(settingsRows.map((s) => [s.key, s.value]))
  const rawInvest = settings.get('investment_as_expense')
  const invest = rawInvest == null ? true : String(rawInvest).toLowerCase() === 'true'

  const goalsRows = await db.all<{ name: string; target_amount: number; source: string }>(
    'SELECT name, target_amount, source FROM goals ORDER BY sort_order, name',
  )
  const goals: Goal[] = goalsRows.map((g) => ({
    name: g.name, target_amount: g.target_amount, source: g.source as 'savings' | 'net_worth',
  }))
  const months = (await db.all<{ month: string }>('SELECT month FROM dashboard_months ORDER BY month')).map((r) => r.month)

  return {
    categories,
    income_owner,
    investment_as_expense: invest,
    goals,
    active_goal: settings.get('active_goal') ?? null,
    dashboard_months: months,
  }
}

// --------------------------------------------------------------------------- //
// dataset（集計用）
// --------------------------------------------------------------------------- //
export async function loadDataset(db: DB, config?: Config): Promise<{ rows: DatasetRow[]; warnings: string[] }> {
  const cfg = config ?? (await loadConfig(db))
  const mapping = categoryToGroup(cfg)
  const warnings: string[] = []
  const rows: DatasetRow[] = []
  const unknown = new Set<string>()

  const entryRows = await db.all<{ month: string; category: string; amount: number }>(
    'SELECT month, category, amount FROM entries ORDER BY id',
  )
  for (const e of entryRows) {
    let group = mapping[e.category]
    if (group === undefined) {
      unknown.add(e.category)
      group = '未分類'
    }
    rows.push({ 年月: e.month, カテゴリ: e.category, 金額: e.amount, グループ: group })
  }

  for (const spec of ALL_BUNDLES) {
    const monthly = await db.all<{ month: string; total: number | null }>(
      'SELECT month, SUM(amount) AS total FROM bundle_items WHERE kind = ? GROUP BY month',
      [spec.key],
    )
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

export async function allMonths(db: DB): Promise<string[]> {
  const rows = await db.all<{ month: string }>(
    'SELECT month FROM entries UNION SELECT month FROM bundle_items UNION SELECT month FROM dashboard_months',
  )
  return rows.map((r) => r.month).sort(codePointSort)
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

export async function listEntries(db: DB, month?: string | null, group?: string | null, config?: Config): Promise<EntryRow[]> {
  const raw = await db.all<{ id: number; month: string; category: string; amount: number }>(
    "SELECT id, month, category, amount FROM entries WHERE source = 'manual' ORDER BY id",
  )
  let out: EntryRow[] = raw.map((r) => ({ id: r.id, 年月: r.month, カテゴリ: r.category, 金額: r.amount }))
  if (month != null) out = out.filter((r) => r.年月 === month)
  if (group != null) {
    const mapping = categoryToGroup(config ?? (await loadConfig(db)))
    out = out.filter((r) => mapping[r.カテゴリ] === group)
  }
  return out
}

export async function entryExists(db: DB, id: number): Promise<boolean> {
  const rows = await db.all("SELECT 1 FROM entries WHERE id = ? AND source = 'manual'", [id])
  return rows.length > 0
}

export async function addEntry(db: DB, config: Config, month: unknown, category: unknown, amount: unknown): Promise<EntryRow[]> {
  let normalizedMonth: string
  try {
    normalizedMonth = normalizeMonth(month)
  } catch {
    throw new ValidationError('年月の形式が不正です（例: 2026-06）')
  }
  const cat = String(category).trim()
  if (!(cat in categoryToGroup(config))) throw new ValidationError(`カテゴリ「${cat}」は登録されていません`)
  const value = validateAmount(amount)
  await db.run("INSERT INTO entries (month, category, amount, source) VALUES (?, ?, ?, 'manual')", [normalizedMonth, cat, value])
  return listEntries(db)
}

export async function updateEntryAmount(db: DB, id: number, amount: unknown): Promise<EntryRow[]> {
  const value = validateAmount(amount)
  await db.run("UPDATE entries SET amount = ? WHERE id = ? AND source = 'manual'", [value, id])
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

export async function updateBundleAmount(db: DB, kind: string, id: number, amount: unknown): Promise<BundleItemRow[]> {
  const value = validateAmount(amount)
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
  const rows = await db.all<{ category: string; c: number }>('SELECT category, COUNT(*) AS c FROM entries GROUP BY category')
  const usage: Record<string, number> = {}
  for (const r of rows) usage[r.category] = Number(r.c)
  return usage
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
// 翌月作成
// --------------------------------------------------------------------------- //
export async function createNextMonth(db: DB, config?: Config): Promise<string> {
  const cfg = config ?? (await loadConfig(db))
  const months = await allMonths(db)
  if (months.length === 0) throw new ValidationError('基準となる月がありません。先に当月のデータを入力してください。')
  const base = months[months.length - 1]
  const target = nextMonth(base)

  const mapping = categoryToGroup(cfg)
  const fixedCats = Object.keys(mapping).filter((c) => mapping[c] === FIXED_COST_GROUP)

  if (fixedCats.length) {
    const placeholders = fixedCats.map(() => '?').join(',')
    const already = await db.all(
      `SELECT 1 FROM entries WHERE month = ? AND category IN (${placeholders}) LIMIT 1`,
      [target, ...fixedCats],
    )
    if (!already.length) {
      const baseFixed = await db.all<{ category: string; amount: number }>(
        `SELECT category, amount FROM entries WHERE month = ? AND category IN (${placeholders}) ORDER BY id`,
        [base, ...fixedCats],
      )
      for (const row of baseFixed) {
        await db.run("INSERT INTO entries (month, category, amount, source) VALUES (?, ?, ?, 'manual')", [target, row.category, row.amount])
      }
    }
  }

  for (const spec of ALL_BUNDLES) {
    const hasTarget = await db.all('SELECT 1 FROM bundle_items WHERE kind = ? AND month = ? LIMIT 1', [spec.key, target])
    if (hasTarget.length) continue
    const baseItems = await db.all<{ name: string; amount: number }>(
      'SELECT name, amount FROM bundle_items WHERE kind = ? AND month = ? ORDER BY id',
      [spec.key, base],
    )
    for (const row of baseItems) {
      await db.run('INSERT INTO bundle_items (kind, month, name, amount) VALUES (?, ?, ?, ?)', [spec.key, target, row.name, row.amount])
    }
  }

  await db.run('INSERT OR IGNORE INTO dashboard_months (month) VALUES (?)', [target])
  return target
}
