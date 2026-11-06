/**
 * D1 アクセスの薄いラッパ（Python版 src/db.py の Database Protocol に相当）。
 * 位置プレースホルダ ? のみ。
 */

export interface DB {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<{ last_row_id: number | null; changes: number }>
  batch(statements: [string, unknown[]][]): Promise<void>
  /** 複数SELECTを1往復で実行し、文ごとの行配列を同じ順序で返す。 */
  batchAll(statements: [string, unknown[]][]): Promise<unknown[][]>
}

export function makeDb(binding: D1Database): DB {
  function prepare(sql: string, params: unknown[]) {
    return params.length ? binding.prepare(sql).bind(...params) : binding.prepare(sql)
  }

  return {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const r = await prepare(sql, params).all<T>()
      return r.results
    },
    async run(sql: string, params: unknown[] = []) {
      const r = await prepare(sql, params).run()
      return {
        last_row_id: (r.meta.last_row_id as number | undefined) ?? null,
        changes: (r.meta.changes as number | undefined) ?? 0,
      }
    },
    async batch(statements: [string, unknown[]][]) {
      const prepared = statements.map(([sql, params]) => prepare(sql, params))
      if (prepared.length) await binding.batch(prepared)
    },
    async batchAll(statements: [string, unknown[]][]): Promise<unknown[][]> {
      if (!statements.length) return []
      const prepared = statements.map(([sql, params]) => prepare(sql, params))
      const results = await binding.batch(prepared)
      return results.map((r) => r.results ?? [])
    },
  }
}
