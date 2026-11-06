/**
 * 月の準備（previousDataMonth / ensureMonth / ensureCurrentMonth / createNextMonth）のテスト。
 *
 * 本番で実際に動いているのはこの worker/src/repo.ts だが、これまでテストが無く
 * 検証は backend/src/repo.py（Python版ミラー）に頼っていた。実マイグレーションに対する
 * 実SQLで、Python版と同じシナリオ（backend/tests/test_api_months.py）を検証する。
 */
import { describe, expect, it } from 'vitest'
import { createTestDb } from './testDb'
import {
  ALL_BUNDLES,
  createNextMonth,
  ensureCurrentMonth,
  ensureMonth,
  listBundleItems,
  listEntries,
  previousDataMonth,
} from '../src/repo'
import { addMonths } from '../src/dates'
import type { DB } from '../src/db'

const CURRENT = '2026-08' // ensureCurrentMonth の today に渡す固定値（YYYY-MM）。日付非依存にする。

async function seedEntries(db: DB, rows: [string, string, number, string][]) {
  for (const [month, category, amount, source] of rows) {
    await db.run('INSERT INTO entries (month, category, amount, source) VALUES (?, ?, ?, ?)', [
      month,
      category,
      amount,
      source,
    ])
  }
}

async function seedBundles(db: DB, rows: [string, string, string, number][]) {
  for (const [kind, month, name, amount] of rows) {
    await db.run('INSERT INTO bundle_items (kind, month, name, amount) VALUES (?, ?, ?, ?)', [kind, month, name, amount])
  }
}

async function seedDashboardMonths(db: DB, months: string[]) {
  for (const month of months) {
    await db.run('INSERT OR IGNORE INTO dashboard_months (month) VALUES (?)', [month])
  }
}

describe('previousDataMonth', () => {
  it('dashboard_months の行は無視する（実データが無いと base に選ばれない）', async () => {
    const db = createTestDb()
    await seedDashboardMonths(db, ['2026-07']) // マーカーのみ、entries/bundle_items は空
    expect(await previousDataMonth(db, '2026-08')).toBeNull()
  })

  it('直前に実データがあればそれを返す', async () => {
    const db = createTestDb()
    await seedEntries(db, [['2026-06', '家賃', 85000, 'manual']])
    expect(await previousDataMonth(db, '2026-08')).toBe('2026-06')
  })
})

describe('ensureCurrentMonth', () => {
  it('データが一件も無い初回起動では何もしない', async () => {
    const db = createTestDb()
    const result = await ensureCurrentMonth(db, undefined, CURRENT)
    expect(result).toEqual({ month: CURRENT, created: false, base: null, carried_entries: 0, carried_bundle_items: 0 })
    expect(await db.all('SELECT * FROM dashboard_months')).toEqual([])
  })

  it('固定費・サブスク・通信費を前月から引き継ぐ', async () => {
    const db = createTestDb()
    const prev = addMonths(CURRENT, -1)
    await seedEntries(db, [
      [prev, '夫給与', 280000, 'manual'],
      [prev, '家賃', 85000, 'manual'],
    ])
    await seedBundles(db, [
      ['subscriptions', prev, 'Netflix', 1490],
      ['communications', prev, '自分のスマホ', 6000],
    ])

    const result = await ensureCurrentMonth(db, undefined, CURRENT)
    expect(result.created).toBe(true)
    expect(result.base).toBe(prev)
    expect(result.carried_entries).toBe(1)
    expect(result.carried_bundle_items).toBe(2)

    const entries = await listEntries(db, CURRENT)
    const cats = entries.map((e) => e.カテゴリ)
    expect(cats).toContain('家賃')
    expect(cats).not.toContain('夫給与') // 収入は引き継がれない

    const subs = await listBundleItems(db, 'subscriptions', CURRENT)
    expect(subs.map((s) => s.名前)).toEqual(['Netflix'])
  })

  it('冪等: 2回目は created=false で二重登録しない', async () => {
    const db = createTestDb()
    const prev = addMonths(CURRENT, -1)
    await seedEntries(db, [[prev, '家賃', 85000, 'manual']])

    await ensureCurrentMonth(db, undefined, CURRENT)
    const second = await ensureCurrentMonth(db, undefined, CURRENT)
    expect(second.created).toBe(false)

    const entries = await listEntries(db, CURRENT, '固定費')
    expect(entries.map((e) => e.カテゴリ)).toEqual(['家賃'])
  })

  it('引き継いだ行を全部消しても再度は復活しない', async () => {
    const db = createTestDb()
    const prev = addMonths(CURRENT, -1)
    await seedEntries(db, [[prev, '家賃', 85000, 'manual']])
    await seedBundles(db, [['subscriptions', prev, 'Netflix', 1490]])

    await ensureCurrentMonth(db, undefined, CURRENT)
    await db.run('DELETE FROM entries WHERE month = ?', [CURRENT])
    await db.run('DELETE FROM bundle_items WHERE month = ?', [CURRENT])

    const result = await ensureCurrentMonth(db, undefined, CURRENT)
    expect(result.created).toBe(false)
    expect(await listEntries(db, CURRENT)).toEqual([])
    expect(await listBundleItems(db, 'subscriptions', CURRENT)).toEqual([])
  })

  it('間の月が空いていても直近の実データ月から引き継ぐ（間の月は作られない）', async () => {
    const db = createTestDb()
    const old = addMonths(CURRENT, -3)
    await seedEntries(db, [[old, '家賃', 85000, 'manual']])

    const result = await ensureCurrentMonth(db, undefined, CURRENT)
    expect(result.created).toBe(true)
    expect(result.base).toBe(old)

    const dashboardMonths = (await db.all<{ month: string }>('SELECT month FROM dashboard_months')).map((r) => r.month)
    expect(dashboardMonths).not.toContain(addMonths(CURRENT, -2))
    expect(dashboardMonths).not.toContain(addMonths(CURRENT, -1))
  })
})

describe('createNextMonth', () => {
  it('中身の無い準備済み月（未来に作りすぎた月）を base として無視する', async () => {
    const db = createTestDb()
    const prev = '2026-01'
    const future = '2026-07' // 中身の無い「準備済み月」— dashboard_months のみ
    await seedEntries(db, [[prev, '家賃', 85000, 'manual']])
    await seedDashboardMonths(db, [future])

    const target = await createNextMonth(db)
    expect(target).toBe(addMonths(future, 1)) // '2026-08'

    const fixed = await listEntries(db, target, '固定費')
    // 旧実装は base が空の future になり何も引き継がなかった。修正後は prev から正しく引き継ぐ。
    expect(fixed.map((e) => e.カテゴリ)).toEqual(['家賃'])
  })

  it('冪等: 対象月に既に固定費があれば重複登録しない', async () => {
    const db = createTestDb()
    await seedEntries(db, [['2026-06', '家賃', 85000, 'manual']])
    const first = await createNextMonth(db)
    expect(first).toBe('2026-07')
    await createNextMonth(db) // 2回目（今回は 2026-08 が新規対象になる）
    const fixed = await listEntries(db, '2026-07', '固定費')
    expect(fixed.map((e) => e.カテゴリ)).toEqual(['家賃'])
  })
})

describe('ensureMonth', () => {
  it('不正な年月文字列は ValidationError を投げる', async () => {
    const db = createTestDb()
    await expect(ensureMonth(db, 'not-a-month')).rejects.toThrow('年月の形式が不正です')
  })

  it('全バンドル種別を引き継ぐ', async () => {
    expect(ALL_BUNDLES.map((s) => s.key)).toEqual(['subscriptions', 'communications'])
  })
})
