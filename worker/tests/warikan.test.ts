/**
 * 割り勘アプリ連携のテスト。Worker専用の機能なので Python版に対応物は無い。
 * Service Binding はフェイクの Fetcher に差し替えて検証する。
 */
import { describe, expect, it } from 'vitest'
import { HttpError } from '../src/errors'
import { ValidationError, type EntryRow } from '../src/repo'
import {
  buildExpensePayload,
  createWarikanExpense,
  deleteWarikanExpense,
  isWarikanEnabled,
  listWarikanUsers,
  type WarikanService,
} from '../src/warikan'

const entry = (overrides: Partial<EntryRow> = {}): EntryRow => ({
  id: 123,
  年月: '2026-11',
  カテゴリ: '食費',
  金額: 3500,
  備考: '食材',
  日: 5,
  割り勘ID: null,
  ...overrides,
})

/** 固定レスポンスを返すフェイク。送られたリクエストを記録する。 */
function fakeService(status: number, body: unknown): { service: WarikanService; requests: Request[] } {
  const requests: Request[] = []
  const service: WarikanService = {
    fetch: async (request) => {
      requests.push(request)
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  }
  return { service, requests }
}

const config = (service: WarikanService) => ({ service, token: 'test-token' })

describe('isWarikanEnabled', () => {
  it('バインディングとトークンが揃っていれば有効', () => {
    const { service } = fakeService(200, {})
    expect(isWarikanEnabled({ service, token: 'test-token' })).toBe(true)
  })

  it.each([
    ['バインディングが無い', { token: 'test-token' }],
    ['トークンが無い', { service: fakeService(200, {}).service }],
    ['両方無い', {}],
    ['トークンが空文字', { service: fakeService(200, {}).service, token: '' }],
  ])('%s なら無効', (_label, cfg) => {
    expect(isWarikanEnabled(cfg)).toBe(false)
  })
})

describe('buildExpensePayload', () => {
  it('エントリを割り勘の支出の形に変換する', () => {
    expect(buildExpensePayload(entry(), 'user-1')).toEqual({
      externalRef: 'kakei:entry:123',
      ym: '2026-11',
      spentOn: '2026-11-05',
      paidBy: 'user-1',
      amount: 3500,
      itemName: '食材',
      categoryName: '食費',
    })
  })

  it('日は2桁にゼロ埋めする', () => {
    expect(buildExpensePayload(entry({ 日: 5 }), 'u').spentOn).toBe('2026-11-05')
    expect(buildExpensePayload(entry({ 日: 25 }), 'u').spentOn).toBe('2026-11-25')
  })

  it('詳細が空ならカテゴリ名を品目名にする', () => {
    expect(buildExpensePayload(entry({ 備考: '' }), 'u').itemName).toBe('食費')
    expect(buildExpensePayload(entry({ 備考: '   ' }), 'u').itemName).toBe('食費')
  })

  it('品目名は60字で切り詰める（割り勘側の上限）', () => {
    const payload = buildExpensePayload(entry({ 備考: 'あ'.repeat(80) }), 'u')
    expect(payload.itemName).toHaveLength(60)
  })

  it('日付が未入力なら反映できない', () => {
    expect(() => buildExpensePayload(entry({ 日: null }), 'u')).toThrow(ValidationError)
  })

  it('支払者が空なら反映できない', () => {
    expect(() => buildExpensePayload(entry(), '   ')).toThrow(ValidationError)
  })

  it('割り勘側の金額上限を超えたら反映できない', () => {
    expect(() => buildExpensePayload(entry({ 金額: 10_000_001 }), 'u')).toThrow(ValidationError)
    expect(buildExpensePayload(entry({ 金額: 10_000_000 }), 'u').amount).toBe(10_000_000)
  })
})

describe('createWarikanExpense', () => {
  it('内部APIにトークン付きでPOSTし、結果を返す', async () => {
    const { service, requests } = fakeService(201, { ok: true, data: { id: 'exp-1', created: true } })

    const result = await createWarikanExpense(config(service), buildExpensePayload(entry(), 'user-1'))

    expect(result).toEqual({ id: 'exp-1', created: true })
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('POST')
    expect(new URL(requests[0].url).pathname).toBe('/api/internal/expenses')
    expect(requests[0].headers.get('X-Internal-Token')).toBe('test-token')
    expect(await requests[0].clone().json()).toMatchObject({ externalRef: 'kakei:entry:123', amount: 3500 })
  })

  it('割り勘側が既存の支出を返したら created:false を伝える', async () => {
    const { service } = fakeService(200, { ok: true, data: { id: 'exp-1', created: false } })

    const result = await createWarikanExpense(config(service), buildExpensePayload(entry(), 'user-1'))

    expect(result.created).toBe(false)
  })

  it('連携が未設定なら503', async () => {
    await expect(createWarikanExpense({}, buildExpensePayload(entry(), 'u'))).rejects.toMatchObject({
      status: 503,
    })
  })

  it('割り勘側の400はメッセージ付きで400に変換する', async () => {
    const { service } = fakeService(400, {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: '支払者が見つかりません' },
    })

    const error = await createWarikanExpense(config(service), buildExpensePayload(entry(), 'u')).catch((e) => e)

    expect(error).toBeInstanceOf(HttpError)
    expect(error.status).toBe(400)
    expect(error.detail).toContain('支払者が見つかりません')
  })

  it('割り勘側の403（トークン不一致・連携無効）は設定の問題として503にする', async () => {
    const { service } = fakeService(403, { ok: false, error: { code: 'FORBIDDEN', message: '内部APIは無効です' } })

    await expect(
      createWarikanExpense(config(service), buildExpensePayload(entry(), 'u')),
    ).rejects.toMatchObject({ status: 503 })
  })

  it('割り勘側の500は502にする', async () => {
    const { service } = fakeService(500, { ok: false, error: { code: 'INTERNAL_ERROR', message: 'err' } })

    await expect(
      createWarikanExpense(config(service), buildExpensePayload(entry(), 'u')),
    ).rejects.toMatchObject({ status: 502 })
  })

  it('割り勘Workerに到達できなければ502', async () => {
    const service: WarikanService = {
      fetch: async () => {
        throw new Error('no such service')
      },
    }

    await expect(
      createWarikanExpense(config(service), buildExpensePayload(entry(), 'u')),
    ).rejects.toMatchObject({ status: 502 })
  })
})

describe('deleteWarikanExpense', () => {
  it('削除できれば true', async () => {
    const { service, requests } = fakeService(200, { ok: true, data: { id: 'exp-1', deleted: true } })

    expect(await deleteWarikanExpense(config(service), 'exp-1')).toBe(true)
    expect(requests[0].method).toBe('DELETE')
    expect(new URL(requests[0].url).pathname).toBe('/api/internal/expenses/exp-1')
  })

  it('割り勘側に既に無ければ（404）false を返しエラーにしない', async () => {
    const { service } = fakeService(404, { ok: false, error: { code: 'NOT_FOUND', message: '支出が見つかりません' } })

    expect(await deleteWarikanExpense(config(service), 'exp-1')).toBe(false)
  })

  it('403は503にする', async () => {
    const { service } = fakeService(403, { ok: false, error: { code: 'FORBIDDEN', message: 'ng' } })

    await expect(deleteWarikanExpense(config(service), 'exp-1')).rejects.toMatchObject({ status: 503 })
  })
})

describe('listWarikanUsers', () => {
  it('割り勘のユーザーを家計簿側のキー名に変換して返す', async () => {
    const { service } = fakeService(200, {
      ok: true,
      data: [
        { userId: 'u1', displayName: 'たくま' },
        { userId: 'u2', displayName: 'かな' },
      ],
    })

    expect(await listWarikanUsers(config(service))).toEqual([
      { user_id: 'u1', display_name: 'たくま' },
      { user_id: 'u2', display_name: 'かな' },
    ])
  })

  it('連携が未設定なら503', async () => {
    await expect(listWarikanUsers({})).rejects.toMatchObject({ status: 503 })
  })
})
