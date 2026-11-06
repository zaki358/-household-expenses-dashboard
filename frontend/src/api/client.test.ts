import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ensureCurrentMonth, getCharts, getDashboard, getSummary } from './client'

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'Error',
      json: () => Promise.resolve(body),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getSummary', () => {
  it('returns parsed JSON on success', async () => {
    const payload = { months: ['2026-01'], summary: [], warnings: [], current_month: '2026-01' }
    mockFetchOnce(200, payload)

    const result = await getSummary()

    expect(result).toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/api/summary')
  })

  it('throws ApiError with backend detail message on failure', async () => {
    mockFetchOnce(404, { detail: 'データがありません' })

    await expect(getSummary()).rejects.toThrow(ApiError)
    await expect(getSummary()).rejects.toThrow('データがありません')
  })
})

describe('ensureCurrentMonth', () => {
  it('POSTs to /api/months/ensure-current and returns parsed JSON', async () => {
    const payload = { month: '2026-08', created: true, base: '2026-07', carried_entries: 1, carried_bundle_items: 6 }
    mockFetchOnce(200, payload)

    const result = await ensureCurrentMonth()

    expect(result).toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/api/months/ensure-current', {
      method: 'POST',
      headers: {},
      body: undefined,
    })
  })

  it('surfaces the backend detail as an ApiError on failure', async () => {
    mockFetchOnce(400, { detail: '年月の形式が不正です（例: 2026-08）' })

    await expect(ensureCurrentMonth()).rejects.toThrow(ApiError)
    await expect(ensureCurrentMonth()).rejects.toThrow('年月の形式が不正です')
  })
})

describe('getDashboard', () => {
  it('omits the query string when no month is given', async () => {
    mockFetchOnce(200, { month: '2026-05', current: {}, comparison: null })
    await getDashboard()
    expect(fetch).toHaveBeenCalledWith('/api/dashboard')
  })

  it('encodes the month query parameter', async () => {
    mockFetchOnce(200, { month: '2026-05', current: {}, comparison: null })
    await getDashboard('2026-05')
    expect(fetch).toHaveBeenCalledWith('/api/dashboard?month=2026-05')
  })
})

describe('getCharts', () => {
  it('requests the charts endpoint with month', async () => {
    mockFetchOnce(200, {
      month: '2026-05',
      expense_breakdown: [],
      group_totals_current: [],
      group_totals_previous: [],
      trend: [],
    })
    await getCharts('2026-05')
    expect(fetch).toHaveBeenCalledWith('/api/charts?month=2026-05')
  })
})
