"""Cloudflare D1 バインディングによる Database 実装（Workers 実行時のみ使用）。

ローカル/テストからは import されない（api.deps.get_db が Workers 分岐でのみ
遅延 import する）。JS FFI（Pyodide 相互運用）に触れるのはこのファイルだけに
隔離する。プレースホルダは位置 `?` のみ。

D1 API（JS 側）:
  env.DB.prepare(sql).bind(*params).all()  → {results, success, meta}
  env.DB.prepare(sql).bind(*params).run()  → {success, meta:{last_row_id, changes}}
  env.DB.batch([stmt, ...])                → 1トランザクションで実行
Pyodide の JsProxy は `.to_py()` で Python の list/dict に変換する。
"""

from typing import Any, Sequence


class D1Database:
    """src.db.Database Protocol の Cloudflare D1 実装。"""

    def __init__(self, binding: Any) -> None:
        # binding は env.DB（Workers ランタイムから注入される D1 バインディング）
        self._db = binding

    def _prepare(self, sql: str, params: Sequence[Any]):
        stmt = self._db.prepare(sql)
        return stmt.bind(*params) if params else stmt

    async def all(self, sql: str, params: Sequence[Any] = ()) -> list[dict]:
        result = await self._prepare(sql, tuple(params)).all()
        rows = result.results.to_py()  # list[dict]（JsProxy → Python）
        return [dict(row) for row in rows]

    async def run(self, sql: str, params: Sequence[Any] = ()) -> dict:
        result = await self._prepare(sql, tuple(params)).run()
        meta = result.meta.to_py()
        return {"last_row_id": meta.get("last_row_id"), "changes": meta.get("changes")}

    async def batch(self, statements: Sequence[tuple[str, Sequence[Any]]]) -> None:
        prepared = [self._prepare(sql, tuple(params)) for sql, params in statements]
        if prepared:
            await self._db.batch(prepared)
