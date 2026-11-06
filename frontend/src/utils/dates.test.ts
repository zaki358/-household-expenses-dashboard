import { describe, expect, it } from 'vitest'
import { daysInMonth, jstDayOfMonth, jstMonth } from './dates'

describe('daysInMonth', () => {
  it.each([
    ['2026-01', 31],
    ['2026-09', 30],
    ['2026-02', 28],
    ['2028-02', 29],
  ])('%s は %i 日', (month, expected) => {
    expect(daysInMonth(month)).toBe(expected)
  })
})

describe('JST の今日', () => {
  it('UTC 15:00 は JST の翌日 0:00 として扱う', () => {
    const now = new Date('2026-09-30T15:00:00Z') // JST 2026-10-01 00:00
    expect(jstMonth(now)).toBe('2026-10')
    expect(jstDayOfMonth(now)).toBe(1)
  })

  it('UTC 14:59 は JST の同日 23:59', () => {
    const now = new Date('2026-09-28T14:59:00Z')
    expect(jstMonth(now)).toBe('2026-09')
    expect(jstDayOfMonth(now)).toBe(28)
  })
})
