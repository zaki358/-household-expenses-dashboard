import { describe, expect, it } from 'vitest'
import type { IndexedEntry } from '../../api/types'
import { sortEntries } from './entryParts'

const entries: IndexedEntry[] = [
  { id: 1, 年月: '2026-09', カテゴリ: '食費', 金額: 500, 備考: '', 日: 10 },
  { id: 2, 年月: '2026-09', カテゴリ: '食費', 金額: 100, 備考: '', 日: null },
  { id: 3, 年月: '2026-09', カテゴリ: '食費', 金額: 900, 備考: '', 日: 25 },
  { id: 4, 年月: '2026-09', カテゴリ: '食費', 金額: 500, 備考: '', 日: 3 },
]

const ids = (list: IndexedEntry[]) => list.map((e) => e.id)

describe('sortEntries', () => {
  it('input: 新しく入力したもの（id降順）が上', () => {
    expect(ids(sortEntries(entries, 'input'))).toEqual([4, 3, 2, 1])
  })

  it('amountDesc: 金額の大きい順、同額は新しい入力が上', () => {
    expect(ids(sortEntries(entries, 'amountDesc'))).toEqual([3, 4, 1, 2])
  })

  it('amountAsc: 金額の小さい順、同額は新しい入力が上', () => {
    expect(ids(sortEntries(entries, 'amountAsc'))).toEqual([2, 4, 1, 3])
  })

  it('dayNewest: 日付の新しい順、日付なしは末尾', () => {
    expect(ids(sortEntries(entries, 'dayNewest'))).toEqual([3, 1, 4, 2])
  })

  it('dayOldest: 日付の古い順、日付なしは末尾', () => {
    expect(ids(sortEntries(entries, 'dayOldest'))).toEqual([4, 1, 3, 2])
  })

  it('元の配列は変更しない', () => {
    const before = ids(entries)
    sortEntries(entries, 'amountDesc')
    expect(ids(entries)).toEqual(before)
  })
})
