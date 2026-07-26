import { describe, expect, it } from 'vitest'
import { summarizeExpenses } from './expenseSummary'

describe('summarizeExpenses', () => {
  it('groups rows, subtotals each group, and sums the grand total', () => {
    const result = summarizeExpenses([
      { カテゴリ: '家賃', グループ: '固定費', 金額: 85000 },
      { カテゴリ: '保険', グループ: '固定費', 金額: 10000 },
      { カテゴリ: '食費', グループ: '変動費', 金額: 45000 },
    ])

    expect(result.合計).toBe(140000)
    const fixed = result.groups.find((g) => g.グループ === '固定費')
    expect(fixed?.小計).toBe(95000)
  })

  it('orders groups by subtotal desc and categories within a group by amount desc', () => {
    const result = summarizeExpenses([
      { カテゴリ: '保険', グループ: '固定費', 金額: 10000 },
      { カテゴリ: '家賃', グループ: '固定費', 金額: 85000 },
      { カテゴリ: '食費', グループ: '変動費', 金額: 45000 },
      { カテゴリ: '娯楽費', グループ: '変動費', 金額: 60000 },
    ])

    // 変動費 小計 105000 > 固定費 小計 95000
    expect(result.groups.map((g) => g.グループ)).toEqual(['変動費', '固定費'])
    expect(result.groups[0].rows.map((r) => r.カテゴリ)).toEqual(['娯楽費', '食費'])
    expect(result.groups[1].rows.map((r) => r.カテゴリ)).toEqual(['家賃', '保険'])
  })

  it('computes each category share as a percentage of the grand total', () => {
    const result = summarizeExpenses([
      { カテゴリ: '家賃', グループ: '固定費', 金額: 75000 },
      { カテゴリ: '食費', グループ: '変動費', 金額: 25000 },
    ])

    const rent = result.groups.flatMap((g) => g.rows).find((r) => r.カテゴリ === '家賃')
    const food = result.groups.flatMap((g) => g.rows).find((r) => r.カテゴリ === '食費')
    expect(rent?.割合).toBeCloseTo(75)
    expect(food?.割合).toBeCloseTo(25)
  })

  it('returns an empty summary for empty input without dividing by zero', () => {
    const result = summarizeExpenses([])
    expect(result).toEqual({ 合計: 0, groups: [] })
  })

  it('keeps a subtotal section for a single-category group', () => {
    const result = summarizeExpenses([{ カテゴリ: '通信費', グループ: '通信費', 金額: 8000 }])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].小計).toBe(8000)
    expect(result.groups[0].割合).toBeCloseTo(100)
  })
})
