/**
 * 割り勘アプリ（別Worker: warikan）への反映クライアント。
 *
 * Cloudflare の Service Binding で呼ぶ。エッジを通らないので割り勘側の
 * Cloudflare Access に阻まれない代わりに、共有トークンで認証する。
 *
 * ここはHTTPの都合だけを持ち、ルーティング（index.ts）とは分けてある。
 * テストでは service にフェイクの Fetcher を渡せる。
 */

import { HttpError } from './errors'
import { ValidationError } from './repo'
import type { EntryRow } from './repo'

/** Fetcher（Service Binding）互換の最小インターフェース。テストでは差し替える。 */
export interface WarikanService {
  fetch(request: Request): Promise<Response>
}

export interface WarikanConfig {
  service?: WarikanService
  token?: string
}

export interface WarikanUser {
  user_id: string
  display_name: string
}

export interface WarikanExpensePayload {
  externalRef: string
  ym: string
  spentOn: string
  paidBy: string
  amount: number
  itemName: string
  categoryName: string
}

export interface WarikanExpenseResult {
  id: string
  created: boolean
}

/** 割り勘アプリ側の金額上限（apps/api/src/routes/internal.ts と揃える）。 */
export const WARIKAN_MAX_AMOUNT = 10_000_000
/** 割り勘アプリ側の品目名の上限文字数。 */
export const WARIKAN_MAX_ITEM_NAME = 60

// Service Binding ではホスト名は無視される（ルーティングはバインディング先のWorkerが行う）。
const BASE = 'https://warikan.internal'

/**
 * 連携が使える状態か。
 * バインディングとトークンのどちらかが欠けていれば false。
 * どちらかを外せば連携が止まる = キルスイッチ。
 */
export function isWarikanEnabled(config: WarikanConfig): boolean {
  return Boolean(config.service && config.token)
}

function requireConfig(config: WarikanConfig): { service: WarikanService; token: string } {
  if (!config.service || !config.token) {
    throw new HttpError(503, '割り勘アプリとの連携が設定されていません')
  }
  return { service: config.service, token: config.token }
}

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string }
}

/**
 * 内部APIを呼び、割り勘側のエンベロープ {ok,data,error} を剥がす。
 * notFoundAsNull=true のときだけ 404 を null として返す（反映の取り消しで使う）。
 */
async function call<T>(
  config: WarikanConfig,
  path: string,
  init: RequestInit,
  notFoundAsNull = false,
): Promise<T | null> {
  const { service, token } = requireConfig(config)

  let res: Response
  try {
    res = await service.fetch(
      new Request(`${BASE}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), 'X-Internal-Token': token },
      }),
    )
  } catch {
    // 割り勘Workerが未デプロイ・ローカルで未起動などで到達できないケース。
    throw new HttpError(502, '割り勘アプリに接続できませんでした')
  }

  if (notFoundAsNull && res.status === 404) return null

  const body = (await res.json().catch(() => null)) as Envelope<T> | null

  if (!res.ok || !body || body.ok !== true || body.data === undefined) {
    const message = body?.error?.message
    if (res.status === 400 && message) throw new HttpError(400, `割り勘アプリ: ${message}`)
    if (res.status === 403) throw new HttpError(503, '割り勘アプリとの連携が許可されていません')
    throw new HttpError(502, message ? `割り勘アプリ: ${message}` : '割り勘アプリとの通信に失敗しました')
  }

  return body.data
}

/** 支払者の候補（割り勘アプリに登録されているユーザー）。 */
export async function listWarikanUsers(config: WarikanConfig): Promise<WarikanUser[]> {
  const data = await call<{ userId: string; displayName: string }[]>(config, '/api/internal/users', { method: 'GET' })
  return (data ?? []).map((user) => ({ user_id: user.userId, display_name: user.displayName }))
}

/**
 * エントリ1件を割り勘アプリへ送る形に変換する。
 *
 * - 日付: 割り勘側は YYYY-MM-DD 必須。日が未入力のエントリは反映できない。
 * - 品目名: 割り勘側に「詳細/メモ」欄が無いので、詳細（備考）をそのまま品目名にする。
 *   空なら区別がつかなくなるのでカテゴリ名で代替する。60字で切り詰める。
 * - カテゴリ: IDではなく名前を渡す。割り勘側に無ければ割り勘側が作る（家計簿が正）。
 * - externalRef: 二重反映を割り勘側のDBでも弾くための由来キー。
 */
export function buildExpensePayload(entry: EntryRow, paidBy: string): WarikanExpensePayload {
  if (entry.日 === null) {
    throw new ValidationError('日付が未入力のため割り勘に反映できません')
  }
  if (entry.金額 > WARIKAN_MAX_AMOUNT) {
    throw new ValidationError(`割り勘に反映できる金額は${WARIKAN_MAX_AMOUNT.toLocaleString('en-US')}円までです`)
  }
  const payer = paidBy.trim()
  if (!payer) {
    throw new ValidationError('支払った人を選択してください')
  }

  return {
    externalRef: `kakei:entry:${entry.id}`,
    ym: entry.年月,
    spentOn: `${entry.年月}-${String(entry.日).padStart(2, '0')}`,
    paidBy: payer,
    amount: entry.金額,
    itemName: (entry.備考.trim() || entry.カテゴリ).slice(0, WARIKAN_MAX_ITEM_NAME),
    categoryName: entry.カテゴリ,
  }
}

/** 支出を作成する。同じ externalRef で呼ばれた場合、割り勘側が既存の支出を返す（冪等）。 */
export async function createWarikanExpense(
  config: WarikanConfig,
  payload: WarikanExpensePayload,
): Promise<WarikanExpenseResult> {
  const data = await call<{ id: string; created: boolean }>(config, '/api/internal/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  // call は notFoundAsNull=false なので null は返らない（型を絞るためのガード）。
  if (!data) throw new HttpError(502, '割り勘アプリとの通信に失敗しました')
  return { id: data.id, created: data.created }
}

/**
 * 支出を削除する（反映の取り消し）。
 * 既に割り勘アプリ側で手動削除されていた場合は false を返す。
 * 家計簿側の記録だけクリアすれば整合が取れるので、エラーにはしない。
 */
export async function deleteWarikanExpense(config: WarikanConfig, expenseId: string): Promise<boolean> {
  const data = await call<{ id: string }>(
    config,
    `/api/internal/expenses/${encodeURIComponent(expenseId)}`,
    { method: 'DELETE' },
    true,
  )
  return data !== null
}
