"""DB 接続の依存注入。

- Cloudflare Workers: ASGI scope に注入された env から D1 バインディングを使う
- ローカル/テスト: stdlib sqlite3（KAKEI_DB、既定 backend/local.db）

ルーターは `db = Depends(get_db)` で受け取り、src.repo 経由で読み書きする。
テストは `app.dependency_overrides[get_db]` で in-memory DB を注入する。
"""

import os
from pathlib import Path

from fastapi import Request

from src.db import Database, SqliteDatabase

PROJECT_ROOT = Path(__file__).resolve().parent.parent

_local_db: SqliteDatabase | None = None


def get_db(request: Request) -> Database:
    """リクエストごとに使う Database 実装を返す。"""
    env = request.scope.get("env")
    if env is not None:  # Cloudflare Workers 実行時のみ
        from src.d1 import D1Database
        return D1Database(env.DB)

    global _local_db
    if _local_db is None:
        path = os.environ.get("KAKEI_DB", str(PROJECT_ROOT / "local.db"))
        _local_db = SqliteDatabase(path)
    return _local_db
