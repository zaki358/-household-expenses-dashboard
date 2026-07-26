"""エントリ（収入・固定費・インフラ・投資）CRUD APIのテスト。

in-memory DB（conftest の client）で検証する。id は DB の実 id（1 始まり）。
"""


def test_list_empty(client):
    res = client.get("/api/entries")
    assert res.status_code == 200
    assert res.json() == []


def test_create_entry(client):
    res = client.post("/api/entries", json={"month": "2026-06", "category": "夫給与", "amount": 280000})
    assert res.status_code == 200
    assert res.json() == [{"id": 1, "年月": "2026-06", "カテゴリ": "夫給与", "金額": 280000}]


def test_create_entry_rejects_unknown_category(client):
    res = client.post("/api/entries", json={"month": "2026-06", "category": "存在しない", "amount": 1000})
    assert res.status_code == 400


def test_create_entry_rejects_non_positive_amount(client):
    res = client.post("/api/entries", json={"month": "2026-06", "category": "食費", "amount": 0})
    assert res.status_code == 400


def test_update_entry_amount(client):
    client.post("/api/entries", json={"month": "2026-06", "category": "家賃", "amount": 85000})
    res = client.put("/api/entries/1", json={"amount": 90000})
    assert res.status_code == 200
    assert res.json()[0]["金額"] == 90000


def test_update_unknown_id_404(client):
    res = client.put("/api/entries/5", json={"amount": 1000})
    assert res.status_code == 404


def test_delete_entry(client):
    client.post("/api/entries", json={"month": "2026-06", "category": "夫給与", "amount": 280000})
    client.post("/api/entries", json={"month": "2026-06", "category": "家賃", "amount": 85000})
    res = client.delete("/api/entries/1")
    assert res.status_code == 200
    assert [e["カテゴリ"] for e in res.json()] == ["家賃"]


def test_filter_by_month_and_group(client):
    client.post("/api/entries", json={"month": "2026-06", "category": "夫給与", "amount": 280000})
    client.post("/api/entries", json={"month": "2026-06", "category": "家賃", "amount": 85000})
    client.post("/api/entries", json={"month": "2026-07", "category": "家賃", "amount": 85000})

    res = client.get("/api/entries", params={"month": "2026-06", "group": "固定費"})
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["カテゴリ"] == "家賃"


def test_entries_persist_across_requests(client):
    """保存は DB への書き込みなので、別リクエストでも反映が見える。"""
    client.post("/api/entries", json={"month": "2026-06", "category": "夫給与", "amount": 280000})
    res = client.get("/api/entries")
    assert len(res.json()) == 1


def test_added_category_can_be_used(client):
    """設定でカテゴリを追加すると、そのカテゴリで入力できる（DB隔離の確認）。"""
    res = client.post("/api/config/categories", json={"group": "変動費", "name": "テスト用カテゴリ"})
    assert res.status_code == 200

    res = client.post("/api/entries", json={"month": "2026-06", "category": "テスト用カテゴリ", "amount": 1000})
    assert res.status_code == 200

    res = client.get("/api/entries", params={"month": "2026-06", "group": "変動費"})
    assert res.status_code == 200
    assert [e["カテゴリ"] for e in res.json()] == ["テスト用カテゴリ"]
