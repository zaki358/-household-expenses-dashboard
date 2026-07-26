import type {
  ChartsResponse,
  ConfigOut,
  DashboardResponse,
  Goal,
  GoalStatus,
  ImportReport,
  IndexedBundleItem,
  IndexedEntry,
  SummaryResponse,
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

export function createEntry(month: string, category: string, amount: number): Promise<IndexedEntry[]> {
  return mutateJson<IndexedEntry[]>('POST', '/api/entries', { month, category, amount })
}

export function deleteEntry(id: number): Promise<IndexedEntry[]> {
  return mutateJson<IndexedEntry[]>('DELETE', `/api/entries/${id}`)
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
