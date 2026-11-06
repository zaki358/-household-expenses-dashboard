import type {
  ChartsResponse,
  ConfigOut,
  DashboardResponse,
  EnsureMonthResponse,
  Goal,
  GoalStatus,
  ImportReport,
  IndexedBundleItem,
  IndexedEntry,
  MonthDeleteResponse,
  SummaryResponse,
  WarikanStatus,
  WarikanUser,
} from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    const detail =
      body && typeof body === 'object' && 'detail' in body ? String((body as { detail: unknown }).detail) : res.statusText
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export function getSummary(): Promise<SummaryResponse> {
  return getJson<SummaryResponse>('/api/summary')
}

export function getDashboard(month?: string): Promise<DashboardResponse> {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  return getJson<DashboardResponse>(`/api/dashboard${query}`)
}

export function getCharts(month?: string): Promise<ChartsResponse> {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  return getJson<ChartsResponse>(`/api/charts${query}`)
}

async function mutateJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const b: unknown = await res.json().catch(() => null)
    const detail =
      b && typeof b === 'object' && 'detail' in b ? String((b as { detail: unknown }).detail) : res.statusText
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

// Entries
export function getEntries(month?: string, group?: string): Promise<IndexedEntry[]> {
  const params = new URLSearchParams()
  if (month) params.set('month', month)
  if (group) params.set('group', group)
  const qs = params.toString()
  return getJson<IndexedEntry[]>(`/api/entries${qs ? `?${qs}` : ''}`)
}

// day: その月の何日か。undefined は送らない（サーバー側で「触らない」）、null は「日付なし／クリア」。
export function createEntry(
  month: string, category: string, amount: number, note?: string, day?: number | null,
): Promise<IndexedEntry[]> {
  return mutateJson<IndexedEntry[]>('POST', '/api/entries', { month, category, amount, note, day })
}

export function updateEntry(
  id: number, amount: number, category?: string, note?: string, day?: number | null,
): Promise<IndexedEntry[]> {
  return mutateJson<IndexedEntry[]>('PUT', `/api/entries/${id}`, { amount, category, note, day })
}

export function deleteEntry(id: number): Promise<IndexedEntry[]> {
  return mutateJson<IndexedEntry[]>('DELETE', `/api/entries/${id}`)
}

// 割り勘アプリ連携
// 本番(Worker)専用の機能。ローカルのFastAPIには該当ルートが無いため、
// getWarikanStatus は404になる。呼び出し側は失敗を「連携なし」として扱う。
export function getWarikanStatus(): Promise<WarikanStatus> {
  return getJson<WarikanStatus>('/api/warikan/status')
}

export function getWarikanUsers(): Promise<WarikanUser[]> {
  return getJson<WarikanUser[]>('/api/warikan/users')
}

export function reflectToWarikan(id: number, paidBy: string): Promise<IndexedEntry[]> {
  return mutateJson<IndexedEntry[]>('POST', `/api/entries/${id}/warikan`, { paid_by: paidBy })
}

export function cancelWarikanReflect(id: number): Promise<IndexedEntry[]> {
  return mutateJson<IndexedEntry[]>('DELETE', `/api/entries/${id}/warikan`)
}

// Bundles
export function getBundleItems(kind: string, month?: string): Promise<IndexedBundleItem[]> {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  return getJson<IndexedBundleItem[]>(`/api/bundles/${kind}${query}`)
}

export function createBundleItem(
  kind: string,
  month: string,
  name: string,
  amount: number,
): Promise<IndexedBundleItem[]> {
  return mutateJson<IndexedBundleItem[]>('POST', `/api/bundles/${kind}`, { month, name, amount })
}

export function updateBundleItem(kind: string, id: number, amount: number, name?: string): Promise<IndexedBundleItem[]> {
  return mutateJson<IndexedBundleItem[]>('PUT', `/api/bundles/${kind}/${id}`, { amount, name })
}

export function deleteBundleItem(kind: string, id: number): Promise<IndexedBundleItem[]> {
  return mutateJson<IndexedBundleItem[]>('DELETE', `/api/bundles/${kind}/${id}`)
}

// Goals
export function getGoals(): Promise<Goal[]> {
  return getJson<Goal[]>('/api/goals')
}

export function getGoalStatus(): Promise<GoalStatus | null> {
  return getJson<GoalStatus | null>('/api/goals/status')
}

export function createGoal(name: string, target_amount: number, source: 'savings' | 'net_worth'): Promise<Goal[]> {
  return mutateJson<Goal[]>('POST', '/api/goals', { name, target_amount, source })
}

export function deleteGoal(name: string): Promise<Goal[]> {
  return mutateJson<Goal[]>('DELETE', `/api/goals/${encodeURIComponent(name)}`)
}

export function setActiveGoal(name: string): Promise<Goal[]> {
  return mutateJson<Goal[]>('PUT', '/api/goals/active', { name })
}

// Config
export function getConfig(): Promise<ConfigOut> {
  return getJson<ConfigOut>('/api/config')
}

export function updateInvestmentMode(investment_as_expense: boolean): Promise<ConfigOut> {
  return mutateJson<ConfigOut>('PUT', '/api/config/investment-mode', { investment_as_expense })
}

export function createCategory(group: string, name: string): Promise<ConfigOut> {
  return mutateJson<ConfigOut>('POST', '/api/config/categories', { group, name })
}

export function deleteCategory(name: string): Promise<ConfigOut> {
  return mutateJson<ConfigOut>('DELETE', `/api/config/categories/${encodeURIComponent(name)}`)
}

// Months
export function createNextMonth(): Promise<{ month: string }> {
  return mutateJson<{ month: string }>('POST', '/api/months/next')
}

export function ensureCurrentMonth(): Promise<EnsureMonthResponse> {
  return mutateJson<EnsureMonthResponse>('POST', '/api/months/ensure-current')
}

export function deleteMonth(month: string): Promise<MonthDeleteResponse> {
  return mutateJson<MonthDeleteResponse>('DELETE', `/api/months/${encodeURIComponent(month)}`)
}

// CSV 取込・書き出し
export async function importCsv(csvText: string, dryRun: boolean): Promise<ImportReport> {
  const res = await fetch(`/api/import/csv?dry_run=${dryRun}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    body: csvText,
  })
  if (!res.ok) {
    const b: unknown = await res.json().catch(() => null)
    const detail =
      b && typeof b === 'object' && 'detail' in b ? String((b as { detail: unknown }).detail) : res.statusText
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<ImportReport>
}

export const exportEntriesUrl = '/api/export/entries.csv'

export function exportBundleUrl(kind: string): string {
  return `/api/export/bundles/${kind}.csv`
}
