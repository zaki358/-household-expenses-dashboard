import { describe, expect, it } from 'vitest'
import { categoryColorMap, colorForCategory, fallbackCategoryPalette } from '../categoryColors'

/** WCAG相対輝度。黒背景(#000)でのコントラスト比は (L + 0.05) / 0.05。 */
function relativeLuminance(hex: string): number {
  const n = hex.replace('#', '')
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

describe('categoryColors', () => {
  it('maps known categories to their fixed color', () => {
    expect(colorForCategory('家賃')).toBe('#4dabf7')
    expect(colorForCategory('電気')).toBe('#ffd43b')
    expect(colorForCategory('通信費')).toBe('#ced4da')
    expect(colorForCategory('食費')).toBe('#51cf66')
    expect(colorForCategory('ガソリン(車)')).toBe('#ff6b6b')
    expect(colorForCategory('NISA')).toBe('#9775fa')
  })

  it('assigns a unique color to every mapped category', () => {
    const values = Object.values(categoryColorMap)
    expect(new Set(values).size).toBe(values.length)
  })

  it('uses colors that stay legible on the black canvas (contrast >= 3:1)', () => {
    const minContrast = 3
    for (const color of [...Object.values(categoryColorMap), ...fallbackCategoryPalette]) {
      const contrast = (relativeLuminance(color) + 0.05) / 0.05
      expect(contrast, `${color} is too dark on black`).toBeGreaterThanOrEqual(minContrast)
    }
  })

  it('gives an unknown category a deterministic color from the fallback palette', () => {
    const first = colorForCategory('未知のカテゴリ')
    const second = colorForCategory('未知のカテゴリ')
    expect(first).toBe(second)
    expect(fallbackCategoryPalette).toContain(first)
  })
})
