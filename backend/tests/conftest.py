"""API テスト共通フィクスチャ。

in-memory SQLite（migrations＋seed 適用済み）を get_db に注入した TestClient を
提供する。D1 も SQLite なので方言差はほぼ無く、これで本番相当の検証ができる。
"""

import pytest
from fastapi.testclient import TestClient

import main
from api.deps import get_db
from src.db import SqliteDatabase


@pytest.fixture
def db():
    database = SqliteDatabase(":memory:")
    try:
        yield database
    finally:
        database.close()


@pytest.fixture
def client(db):
    main.app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def seed(db):
    """テストデータを直接投入するヘルパ。

    seed(entries=[(月, カテゴリ, 金額[, source]) ...],
         bundles=[(kind, 月, 名前, 金額) ...],
         months=[月, ...])  # dashboard_months に直接登録（ensure_month の恒久マーカー検証用）
    """
    def _seed(entries=None, bundles=None, months=None):
        for row in entries or []:
            month, category, amount = row[0], row[1], row[2]
            source = row[3] if len(row) > 3 else "import"
            db._conn.execute(
                "INSERT INTO entries (month, category, amount, source) VALUES (?, ?, ?, ?)",
                (month, category, amount, source),
            )
        for kind, month, name, amount in bundles or []:
            db._conn.execute(
                "INSERT INTO bundle_items (kind, month, name, amount) VALUES (?, ?, ?, ?)",
                (kind, month, name, amount),
            )
        for month in months or []:
            db._conn.execute(
                "INSERT OR IGNORE INTO dashboard_months (month) VALUES (?)", (month,)
            )
        db._conn.commit()

    return _seed
