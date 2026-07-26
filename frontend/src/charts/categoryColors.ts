/**
 * カテゴリ固定色。円グラフのスライスと支出一覧表のスウォッチで共有する。
 *
 * 方針: **黒キャンバス（#000 / #181818）での視認性を最優先**に、
 * 鮮やか（赤・黄・緑・青・紫・ピンク）で明るい色を全カテゴリに割り当てる。
 * design.md の単一アクセント／warning色除外の制約には縛られない
 * （オーナー指示 2026-07-11）。カラーは Open Color パレット由来で、
 * 黒背景でのコントラストは 3:1 以上（categoryColors.test.ts で担保）。
 * 月を切り替えても同じカテゴリは常に同じ色。名前は backend/config.yaml のミラー。
 */
export const categoryColorMap: Readonly<Record<string, string>> = {
  // 固定費 — 青
  家賃: '#4dabf7',
  保険: '#74c0fc',
  サブスク: '#a5d8ff',
  // インフラ — 電気=黄 / ガス=橙 / 水道=シアン（直感的で黒背景に映える）
  電気: '#ffd43b',
  ガス: '#ff922b',
  水道: '#3bc9db',
  // 通信費 — 明るいシルバー
  通信費: '#ced4da',
  // 変動費 — 緑
  食費: '#51cf66',
  消耗品: '#94d82d',
  交際費: '#a9e34b',
  娯楽費: '#63e6be',
  // 車 — 赤
  'ガソリン(車)': '#ff6b6b',
  車保険: '#ffa8a8',
  車税金: '#f03e3e',
  車検: '#ffc9c9',
  車整備: '#e8590c',
  // バイク — ピンク／マゼンタ（車の赤系と分離）
  'ガソリン(バイク)': '#f783ac',
  バイク保険: '#faa2c1',
  バイク税金: '#e64980',
  バイク整備: '#d6336c',
  // 投資 — 紫
  NISA: '#9775fa',
  投資信託: '#b197fc',
  株式: '#d0bfff',
  その他投資: '#845ef7',
}

/** config.yaml に無いカテゴリ（後から追加された等）用の予備色。黒背景で明るい色のみ。 */
export const fallbackCategoryPalette: readonly string[] = [
  '#ff8cc8',
  '#66d9e8',
  '#ffa94d',
  '#b2f2bb',
  '#eebefa',
  '#dee2e6',
]

/** 文字列を安定した非負整数へ（djb2）。同じ名前は常に同じ予備色になる。 */
function hashString(value: string): number {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

/** カテゴリ名 → 固定色。未知カテゴリはハッシュで予備色に安定割当。 */
export function colorForCategory(category: string): string {
  const mapped = categoryColorMap[category]
  if (mapped) {
    return mapped
  }
  return fallbackCategoryPalette[hashString(category) % fallbackCategoryPalette.length]
}
