/**
 * D1 アクセスの薄いラッパ（Python版 src/db.py の Database Protocol に相当）。
 * 位置プレースホルダ ? のみ。
 */

export interface DB {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  run(sql: string, params?: unknown[]): Promise<{ last_row_id: number | null; changes: number }>
  batch(statements: [string, unknown[]][]): Promise<void>
}

export function makeDb(binding: D1Database): DB {
  return {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const stmt = params.length ? binding.prepare(sql).bind(...params) : binding.prepare(sql)
      const r = await stmt.all<T>()
      return r.results
    },
    async run(sql: string, params: unknown[] = []) {
      const stmt = params.length ? binding.prepare(sql).bind(...params) : binding.prepare(sql)
      const r = await stmt.run()
      return {
        last_row_id: (r.meta.last_row_id as number | undefined) ?? null,
        changes: (r.meta.changes as number | undefined) ?? 0,
      }
    },
    async batch(statements: [string, unknown[]][]) {
      const prepared = statements.map(([sql, params]) =>
        params.length ? binding.prepare(sql).bind(...params) : binding.prepare(sql),
      )
      if (prepared.length) await binding.batch(prepared)
    },
  }
}
