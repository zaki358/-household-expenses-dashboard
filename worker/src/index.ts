/**
 * 家計ダッシュボード3 バックエンド（Hono on Cloudflare Workers）。
 * Python/FastAPI版と同一のAPI契約（パス・JSON）を提供する。
 * 単一ホスト名構成: /api/* をこのWorkerが処理し、他は [assets] が配信。
 */

import { Hono } from 'hono'
import { makeDb, type DB } from './db'
import {
  monthlySummary,
  expenseBreakdown,
  groupTotals,
  previousMonth,
  compareMonths,
} from './aggregate'
import { currentMonth } from './dates'
import { goalStatus } from './goal'
import { analyzeEntriesCsv, commitEntries } from './importer'
import { exportEntriesCsv, exportBundleCsv } from './exporter'
import * as repo from './repo'
import { ValidationError } from './repo'
import { HttpError } from './errors'
import {
  buildExpensePayload,
  createWarikanExpense,
  deleteWarikanExpense,
  isWarikanEnabled,
  listWarikanUsers,
  type WarikanConfig,
} from './warikan'

type Bindings = {
  DB: D1Database
  ACCESS_ALLOWED_EMAILS?: string
  /** 割り勘アプリ(warikan Worker)への Service Binding。未設定なら連携は無効。 */
  WARIKAN?: Fetcher
  /** 割り勘アプリの内部APIを呼ぶための共有トークン。未設定なら連携は無効。 */
  WARIKAN_INTERNAL_TOKEN?: string
}

const VALID_KINDS = new Set(['subscriptions', 'communications'])

const app = new Hono<{ Bindings: Bindings }>()

// 多層防御: Access が設定済み(ACCESS_ALLOWED_EMAILS あり)なら、Access が付与する
// 認証済みメールヘッダが許可リストに含まれる場合のみ /api/* を通す。未設定時は素通し（開発時）。
app.use('/api/*', async (c, next) => {
  const allow = c.env.ACCESS_ALLOWED_EMAILS
  if (allow) {
    const email = c.req.header('Cf-Access-Authenticated-User-Email')?.toLowerCase()
    const allowed = allow.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (!email || !allowed.includes(email)) {
      return c.json({ detail: '許可されていません' }, 403)
    }
  }
  await next()
})

// 計測用: Worker内でハンドラに費やした時間を Server-Timing で返す。
// ブラウザが観測した総時間との差が、Access検証・TLS・ネットワーク往復などの固定コスト。
app.use('/api/*', async (c, next) => {
  const started = Date.now()
  await next()
  c.res.headers.set('Server-Timing', `worker;dur=${Date.now() - started}`)
})

function db(c: { env: Bindings }): DB {
  return makeDb(c.env.DB)
}

function warikan(c: { env: Bindings }): WarikanConfig {
  return { service: c.env.WARIKAN, token: c.env.WARIKAN_INTERNAL_TOKEN }
}

async function getState(database: DB) {
  // D1への往復を9回→1回にまとめる (repo.loadState は batchAll を使う)
  const { config, rows, warnings, months } = await repo.loadState(database)
  const summary = monthlySummary(rows, config, months)
  return { config, rows, warnings, summary, months }
}

function resolveMonth(months: string[], month: string | undefined): string {
  if (months.length === 0) throw new HttpError(404, 'データがありません')
  const target = month || months[months.length - 1]
  if (!months.includes(target)) throw new HttpError(404, `指定した月のデータがありません: ${target}`)
  return target
}

// 例外を FastAPI互換の {detail} レスポンスへ
app.onError((err, c) => {
  if (err instanceof ValidationError) return c.json({ detail: err.message }, 400)
  if (err instanceof HttpError) return c.json({ detail: err.detail }, err.status as 400)
  console.error(err)
  return c.json({ detail: 'サーバーエラーが発生しました' }, 500)
})

// --------------------------------------------------------------------------- //
// summary / dashboard / charts
// --------------------------------------------------------------------------- //
app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.get('/api/summary', async (c) => {
  const { warnings, summary, months } = await getState(db(c))
  return c.json({ months, summary, warnings, current_month: currentMonth() })
})

app.get('/api/dashboard', async (c) => {
  const { summary, months } = await getState(db(c))
  const target = resolveMonth(months, c.req.query('month'))
  const current = summary.find((r) => r.年月 === target)!
  const comparison = compareMonths(summary, target)
  return c.json({ month: target, current, comparison })
})

app.get('/api/charts', async (c) => {
  const { config, rows, summary, months } = await getState(db(c))
  const target = resolveMonth(months, c.req.query('month'))
  const breakdown = expenseBreakdown(rows, config, target)
  const currentTotals = groupTotals(rows, target)
  const prev = previousMonth(summary, target)
  const previousTotals = prev !== null ? groupTotals(rows, prev) : []
  return c.json({
    month: target,
    expense_breakdown: breakdown,
    group_totals_current: currentTotals.map((t) => ({ ...t, 月: target })),
    group_totals_previous: previousTotals.map((t) => ({ ...t, 月: prev ?? '' })),
    trend: summary,
  })
})

// --------------------------------------------------------------------------- //
// entries
// --------------------------------------------------------------------------- //
app.get('/api/entries', async (c) => {
  const items = await repo.listEntries(db(c), c.req.query('month') ?? null, c.req.query('group') ?? null)
  return c.json(items)
})

app.post('/api/entries', async (c) => {
  const body = await c.req.json<{ month: string; category: string; amount: number; note?: string; day?: number | null }>()
  const database = db(c)
  const config = await repo.loadConfig(database)
  const updated = await repo.addEntry(database, config, body.month, body.category, body.amount, body.note, body.day)
  return c.json(updated)
})

app.put('/api/entries/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const database = db(c)
  const body = await c.req.json<{ amount: number; category?: string; note?: string; day?: number | null }>()
  const [exists, config] = await Promise.all([repo.entryExists(database, id), repo.loadConfig(database)])
  if (!exists) throw new HttpError(404, 'エントリが存在しません')
  return c.json(await repo.updateEntry(database, config, id, body.amount, body.category, body.note, body.day))
})

app.delete('/api/entries/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const database = db(c)
  const entry = await repo.findEntryById(database, id)
  if (entry === null) throw new HttpError(404, 'エントリが存在しません')
  // 割り勘に反映済みのまま家計簿だけ消すと、割り勘側に由来不明の支出が残り
  // 取り消す手段も失われる。連携が有効なときだけ止める（連携を切った後は普通に消せる）。
  if (entry.割り勘ID !== null && isWarikanEnabled(warikan(c))) {
    throw new HttpError(409, '先に割り勘への反映を取り消してください')
  }
  return c.json(await repo.deleteEntry(database, id))
})

// --------------------------------------------------------------------------- //
// 割り勘アプリ連携（Service Binding 経由。Worker専用で Python版には無い）
// --------------------------------------------------------------------------- //

// フロントはこれを見て反映ボタンを出すか決める。
// 連携を切った（バインディングかシークレットを外した）あとは false になり、
// 画面は連携前とまったく同じ見た目に戻る。
app.get('/api/warikan/status', (c) => c.json({ enabled: isWarikanEnabled(warikan(c)) }))

app.get('/api/warikan/users', async (c) => {
  return c.json(await listWarikanUsers(warikan(c)))
})

app.post('/api/entries/:id/warikan', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<{ paid_by?: string }>().catch(() => ({ paid_by: undefined }))
  const database = db(c)

  const entry = await repo.findEntryById(database, id)
  if (entry === null) throw new HttpError(404, 'エントリが存在しません')
  if (entry.割り勘ID !== null) throw new HttpError(409, '既に割り勘へ反映済みです')

  const payload = buildExpensePayload(entry, body.paid_by ?? '')
  const result = await createWarikanExpense(warikan(c), payload)
  await repo.setWarikanExpenseId(database, id, result.id)

  return c.json(await repo.listEntries(database))
})

app.delete('/api/entries/:id/warikan', async (c) => {
  const id = Number(c.req.param('id'))
  const database = db(c)

  const entry = await repo.findEntryById(database, id)
  if (entry === null) throw new HttpError(404, 'エントリが存在しません')
  if (entry.割り勘ID === null) throw new HttpError(404, '割り勘へ反映されていません')

  // 割り勘側に既に無い場合も成功扱い。家計簿側の記録をクリアして整合を取る。
  await deleteWarikanExpense(warikan(c), entry.割り勘ID)
  await repo.setWarikanExpenseId(database, id, null)

  return c.json(await repo.listEntries(database))
})

// --------------------------------------------------------------------------- //
// bundles
// --------------------------------------------------------------------------- //
function checkKind(kind: string) {
  if (!VALID_KINDS.has(kind)) throw new HttpError(404, `不明なバンドル種別です: ${kind}`)
}

app.get('/api/bundles/:kind', async (c) => {
  const kind = c.req.param('kind')
  checkKind(kind)
  return c.json(await repo.listBundleItems(db(c), kind, c.req.query('month') ?? null))
})

app.post('/api/bundles/:kind', async (c) => {
  const kind = c.req.param('kind')
  checkKind(kind)
  const body = await c.req.json<{ month: string; name: string; amount: number }>()
  return c.json(await repo.addBundleItem(db(c), kind, body.month, body.name, body.amount))
})

app.put('/api/bundles/:kind/:id', async (c) => {
  const kind = c.req.param('kind')
  checkKind(kind)
  const id = Number(c.req.param('id'))
  const database = db(c)
  if (!(await repo.bundleItemExists(database, id, kind))) throw new HttpError(404, '項目が存在しません')
  const body = await c.req.json<{ amount: number; name?: string }>()
  return c.json(await repo.updateBundleItem(database, kind, id, body.amount, body.name))
})

app.delete('/api/bundles/:kind/:id', async (c) => {
  const kind = c.req.param('kind')
  checkKind(kind)
  const id = Number(c.req.param('id'))
  const database = db(c)
  if (!(await repo.bundleItemExists(database, id, kind))) throw new HttpError(404, '項目が存在しません')
  return c.json(await repo.deleteBundleItem(database, kind, id))
})

// --------------------------------------------------------------------------- //
// goals
// --------------------------------------------------------------------------- //
app.get('/api/goals', async (c) => c.json(await repo.listGoals(db(c))))

app.get('/api/goals/status', async (c) => {
  const database = db(c)
  const config = await repo.loadConfig(database)
  const active = await repo.getActiveGoal(database, config)
  if (active === null) return c.json(null)
  const { rows } = await repo.loadDataset(database, config)
  const months = await repo.allMonths(database)
  const summary = monthlySummary(rows, config, months)
  return c.json(goalStatus(summary, active))
})

app.post('/api/goals', async (c) => {
  const body = await c.req.json<{ name: string; target_amount: number; source?: string }>()
  return c.json(await repo.addGoal(db(c), body.name, body.target_amount, body.source ?? 'savings'))
})

app.delete('/api/goals/:name', async (c) => {
  return c.json(await repo.removeGoal(db(c), decodeURIComponent(c.req.param('name'))))
})

app.put('/api/goals/active', async (c) => {
  const body = await c.req.json<{ name: string }>()
  return c.json(await repo.setActiveGoal(db(c), body.name))
})

// --------------------------------------------------------------------------- //
// months
// --------------------------------------------------------------------------- //
app.post('/api/months/next', async (c) => {
  const target = await repo.createNextMonth(db(c))
  return c.json({ month: target })
})

// 当月シートの自動準備。フロントがマウント時に1回だけ叩く（App.tsx）。
app.post('/api/months/ensure-current', async (c) => {
  const result = await repo.ensureCurrentMonth(db(c))
  return c.json(result)
})

// 誤って作成した翌月シートの取り消し用。今月より後の月のみ削除できる（repo.deleteMonth 側で強制）。
app.delete('/api/months/:month', async (c) => {
  const result = await repo.deleteMonth(db(c), decodeURIComponent(c.req.param('month')))
  return c.json(result)
})

// --------------------------------------------------------------------------- //
// config
// --------------------------------------------------------------------------- //
async function configOut(database: DB) {
  // config とカテゴリ使用件数を D1 への1往復でまとめて取得する。
  const { config, usage } = await repo.loadConfigWithUsage(database)
  return {
    investment_as_expense: config.investment_as_expense,
    categories: config.categories,
    category_usage: usage,
    active_goal: config.active_goal,
    dashboard_months: config.dashboard_months,
  }
}

app.get('/api/config', async (c) => c.json(await configOut(db(c))))

app.put('/api/config/investment-mode', async (c) => {
  const body = await c.req.json<{ investment_as_expense: boolean }>()
  const database = db(c)
  await repo.setInvestmentMode(database, body.investment_as_expense)
  return c.json(await configOut(database))
})

app.post('/api/config/categories', async (c) => {
  const body = await c.req.json<{ group: string; name: string }>()
  const database = db(c)
  const config = await repo.loadConfig(database)
  await repo.addCategory(database, body.group, body.name, config)
  return c.json(await configOut(database))
})

app.delete('/api/config/categories/:name', async (c) => {
  const database = db(c)
  await repo.removeCategory(database, decodeURIComponent(c.req.param('name')))
  return c.json(await configOut(database))
})

// --------------------------------------------------------------------------- //
// transfer（CSV取込・書き出し）
// --------------------------------------------------------------------------- //
app.post('/api/import/csv', async (c) => {
  const buf = new Uint8Array(await c.req.arrayBuffer())
  if (buf.length === 0) throw new HttpError(400, 'CSVデータが空です')
  const database = db(c)
  const config = await repo.loadConfig(database)
  const report = analyzeEntriesCsv(buf, config)
  if (!report.ok) throw new HttpError(400, report.error ?? '取込に失敗しました')
  const dryRun = c.req.query('dry_run') !== 'false'
  let committed = 0
  if (!dryRun) committed = await commitEntries(database, report.proposals)
  return c.json({ ...report, dry_run: dryRun, committed })
})

function csvResponse(text: string, filename: string): Response {
  const bom = '﻿'
  return new Response(bom + text, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

app.get('/api/export/entries.csv', async (c) => csvResponse(await exportEntriesCsv(db(c)), 'entries.csv'))
app.get('/api/export/bundles/subscriptions.csv', async (c) => csvResponse(await exportBundleCsv(db(c), 'subscriptions'), 'subscriptions.csv'))
app.get('/api/export/bundles/communications.csv', async (c) => csvResponse(await exportBundleCsv(db(c), 'communications'), 'communications.csv'))

// /api/* で未定義のものは 404（FastAPI互換の detail）
app.all('/api/*', (c) => c.json({ detail: 'Not Found' }, 404))

export default app
