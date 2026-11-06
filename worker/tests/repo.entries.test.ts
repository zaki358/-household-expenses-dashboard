/**
 * entries の「日」（任意入力）のテスト。Python版 backend/tests/test_api_entries.py と同じシナリオ。
 */
import { describe, expect, it } from 'vitest'
import { createTestDb } from './testDb'
import {
  addEntry,
  findEntryById,
  listEntries,
  loadConfig,
  setWarikanExpenseId,
  updateEntry,
  ValidationError,
} from '../src/repo'
import { daysInMonth } from '../src/dates'

async function setup() {
  const db = createTestDb()
  const config = await loadConfig(db)
  return { db, config }
}

describe('daysInMonth', () => {
  it.each([
    ['2026-01', 31],
    ['2026-09', 30],
    ['2026-02', 28],
    ['2028-02', 29],
    ['2100-02', 28],
    ['2000-02', 29],
  ])('%s は %i 日', (month, expected) => {
    expect(daysInMonth(month)).toBe(expected)
  })
})

describe('addEntry の day', () => {
  it('day を指定すると 日 に入る', async () => {
    const { db, config } = await setup()
    const rows = await addEntry(db, config, '2026-09', '食費', 1200, '', 28)
    expect(rows[0].日).toBe(28)
  })

  it('day 未指定・null は 日=null', async () => {
    const { db, config } = await setup()
    await addEntry(db, config, '2026-09', '食費', 1200)
    const rows = await addEntry(db, config, '2026-09', '食費', 1300, '', null)
    expect(rows.map((r) => r.日)).toEqual([null, null])
  })

  it.each([0, 32, -1, 1.5])('範囲外・非整数 (%s) は拒否', async (day) => {
    const { db, config } = await setup()
    await expect(addEntry(db, config, '2026-09', '食費', 1, '', day)).rejects.toBeInstanceOf(ValidationError)
  })

  it('月末を超える日は拒否し、うるう年の2/29は許可', async () => {
    const { db, config } = await setup()
    await expect(addEntry(db, config, '2026-09', '食費', 1, '', 31)).rejects.toBeInstanceOf(ValidationError)
    await expect(addEntry(db, config, '2026-02', '食費', 1, '', 29)).rejects.toBeInstanceOf(ValidationError)
    const rows = await addEntry(db, config, '2028-02', '食費', 1, '', 29)
    expect(rows[0].日).toBe(29)
  })
})

describe('updateEntry の day', () => {
  it('day を更新できる', async () => {
    const { db, config } = await setup()
    await addEntry(db, config, '2026-09', '食費', 1000, '', 1)
    const rows = await updateEntry(db, config, 1, 1000, undefined, undefined, 15)
    expect(rows[0].日).toBe(15)
  })

  it('day 未指定(undefined)なら日付を保持する（後方互換）', async () => {
    const { db, config } = await setup()
    await addEntry(db, config, '2026-09', '食費', 1000, '', 5)
    const rows = await updateEntry(db, config, 1, 2000)
    expect(rows[0].日).toBe(5)
  })

  it('null で日付をクリアできる', async () => {
    const { db, config } = await setup()
    await addEntry(db, config, '2026-09', '食費', 1000, '', 5)
    const rows = await updateEntry(db, config, 1, 1000, undefined, undefined, null)
    expect(rows[0].日).toBeNull()
  })

  it('月末を超える日は拒否', async () => {
    const { db, config } = await setup()
    await addEntry(db, config, '2026-09', '食費', 1000)
    await expect(updateEntry(db, config, 1, 1000, undefined, undefined, 31)).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('割り勘アプリへの反映状態（warikan_expense_id）', () => {
  it('追加直後は未反映（割り勘ID が null）', async () => {
    const { db, config } = await setup()
    const rows = await addEntry(db, config, '2026-09', '食費', 1200, '食材', 5)
    expect(rows[0].割り勘ID).toBeNull()
  })

  it('findEntryById で1件を取得できる', async () => {
    const { db, config } = await setup()
    await addEntry(db, config, '2026-09', '食費', 1200, '食材', 5)
    const entry = await findEntryById(db, 1)
    expect(entry).toEqual({ id: 1, 年月: '2026-09', カテゴリ: '食費', 金額: 1200, 備考: '食材', 日: 5, 割り勘ID: null })
  })

  it('存在しないIDは null', async () => {
    const { db } = await setup()
    expect(await findEntryById(db, 999)).toBeNull()
  })

  it('反映先IDを記録でき、一覧にも出る', async () => {
    const { db, config } = await setup()
    await addEntry(db, config, '2026-09', '食費', 1200, '食材', 5)
    await setWarikanExpenseId(db, 1, 'exp-1')
    const rows = await listEntries(db)
    expect(rows[0].割り勘ID).toBe('exp-1')
  })

  it('null を渡すと未反映に戻る（反映の取り消し）', async () => {
    const { db, config } = await setup()
    await addEntry(db, config, '2026-09', '食費', 1200, '食材', 5)
    await setWarikanExpenseId(db, 1, 'exp-1')
    await setWarikanExpenseId(db, 1, null)
    expect((await findEntryById(db, 1))?.割り勘ID).toBeNull()
  })

  it('金額やカテゴリの更新では反映状態が消えない', async () => {
    const { db, config } = await setup()
    await addEntry(db, config, '2026-09', '食費', 1200, '食材', 5)
    await setWarikanExpenseId(db, 1, 'exp-1')
    const rows = await updateEntry(db, config, 1, 1500, '消耗品', '洗剤', 6)
    expect(rows[0].割り勘ID).toBe('exp-1')
  })
})
