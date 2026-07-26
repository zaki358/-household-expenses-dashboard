"""データベース抽象（Database Protocol）とローカル用 SQLite 実装。

ルーター/リポジトリはこの Protocol にだけ依存する。ローカル開発・テストは
SqliteDatabase（stdlib sqlite3）、Cloudflare 本番は src.d1.D1Database（同一 API）
を注入する。D1 は非同期 API なので、この Protocol も async で統一する
（SQLite 側は同期処理を async で包むだけ）。
"""

import sqlite3
from pathlib import Path
from typing import Any, Protocol, Sequence

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


class Database(Protocol):
    """全 SQL 実行の共通インターフェース（位置プレースホルダ ? のみ）。"""

    async def all(self, sql: str, params: Sequence[Any] = ()) -> list[dict]:
        """SELECT。行を dict のリストで返す。"""
        ...

    async def run(self, sql: str, params: Sequence[Any] = ()) -> dict:
        """INSERT/UPDATE/DELETE。{"last_row_id", "changes"} を返す。"""
        ...

    async def batch(self, statements: Sequence[tuple[str, Sequence[Any]]]) -> None:
        """複数文を1トランザクションで実行する。"""
        ...


class SqliteDatabase:
    """stdlib sqlite3 による Database 実装（ローカル/テスト用）。

    D1 の実体も SQLite のため、方言差はほぼ無い。migrations/ 配下の *.sql を
    ファイル名昇順で1回だけ適用し、schema_migrations に記録する。
    """

    def __init__(self, path: str | Path = ":memory:",
                 migrations_dir: Path | None = MIGRATIONS_DIR,
                 apply_migrations: bool = True) -> None:
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        if apply_migrations and migrations_dir is not None:
            self._apply_migrations(Path(migrations_dir))

    def _apply_migrations(self, migrations_dir: Path) -> None:
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " name TEXT PRIMARY KEY,"
            " applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
        )
        applied = {r["name"] for r in self._conn.execute("SELECT name FROM schema_migrations")}
        for path in sorted(migrations_dir.glob("*.sql")):
            if path.name in applied:
                continue
            self._conn.executescript(path.read_text(encoding="utf-8"))
            self._conn.execute("INSERT INTO schema_migrations (name) VALUES (?)", (path.name,))
            self._conn.commit()

    async def all(self, sql: str, params: Sequence[Any] = ()) -> list[dict]:
        cur = self._conn.execute(sql, tuple(params))
        return [dict(row) for row in cur.fetchall()]

    async def run(self, sql: str, params: Sequence[Any] = ()) -> dict:
        cur = self._conn.execute(sql, tuple(params))
        self._conn.commit()
        return {"last_row_id": cur.lastrowid, "changes": cur.rowcount}

    async def batch(self, statements: Sequence[tuple[str, Sequence[Any]]]) -> None:
        try:
            for sql, params in statements:
                self._conn.execute(sql, tuple(params))
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise

    def close(self) -> None:
        self._conn.close()
