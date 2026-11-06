/**
 * DB インターフェース（src/db.ts）を node:sqlite 上に実装したテスト用フェイク。
 *
 * D1 も実体は SQLite のため方言差はほぼ無い。実マイグレーション(worker/migrations/*.sql)を
 * ファイル名昇順で適用してから使うことで、テストは本番と同じスキーマに対して走る
 * （Python版 SqliteDatabase._apply_migrations の移植・backend/src/db.py 参照）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import type { DB } from '../src/db'

// vitest がバンドルする古い Vite の node built-in 解決テーブルが `node:sqlite` を知らず、
// 通常の `import` だと静的解決に失敗する。Node の実 require で読み込んで回避する
// （型だけは `import type` で取得する — 型注釈は erase されるため同じ問題を起こさない）。
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

function applyMigrations(sqlite: DatabaseSyncType): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'))
  }
}

export function createTestDb(): DB {
  const sqlite = new DatabaseSync(':memory:')
  applyMigrations(sqlite)

  return {
    async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      return sqlite.prepare(sql).all(...(params as never[])) as T[]
    },
    async run(sql: string, params: unknown[] = []) {
      const info = sqlite.prepare(sql).run(...(params as never[]))
      return {
        last_row_id: info.lastInsertRowid === undefined ? null : Number(info.lastInsertRowid),
        changes: Number(info.changes ?? 0),
      }
    },
    async batch(statements: [string, unknown[]][]): Promise<void> {
      if (!statements.length) return
      sqlite.exec('BEGIN')
      try {
        for (const [sql, params] of statements) {
          sqlite.prepare(sql).run(...(params as never[]))
        }
        sqlite.exec('COMMIT')
      } catch (err) {
        sqlite.exec('ROLLBACK')
        throw err
      }
    },
    async batchAll(statements: [string, unknown[]][]): Promise<unknown[][]> {
      if (!statements.length) return []
      return statements.map(([sql, params]) => sqlite.prepare(sql).all(...(params as never[])))
    },
  }
}
