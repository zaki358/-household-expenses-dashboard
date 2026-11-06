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
    assert res.json() == [
        {
            "id": 1,
            "年月": "2026-06",
            "カテゴリ": "夫給与",
            "金額": 280000,
            "備考": "",
            "日": None,
            # 割り勘アプリへの反映先ID。追加直後は未反映。
            "割り勘ID": None,
        }
    ]


def test_create_entry_with_note(client):
    res = client.post(
        "/api/entries",
        json={"month": "2026-06", "category": "消耗品", "amount": 3200, "note": "洗剤"},
    )
    assert res.status_code == 200
    assert res.json()[0]["備考"] == "洗剤"


def test_create_entry_without_note_defaults_to_empty(client):
    """note を送らなくてもエラーにならず空文字になる。"""
    res = client.post("/api/entries", json={"month": "2026-06", "category": "消耗品", "amount": 1000})
    assert res.status_code == 200
    assert res.json()[0]["備考"] == ""


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


def test_update_entry_amount_only_keeps_category_and_note(client):
    """{amount} だけの旧形式PUTでカテゴリ・備考が消えないこと（後方互換）。"""
    client.post("/api/entries", json={"month": "2026-06", "category": "消耗品", "amount": 1000, "note": "洗剤"})
    res = client.put("/api/entries/1", json={"amount": 1500})
    assert res.status_code == 200
    row = res.json()[0]
    assert row["金額"] == 1500
    assert row["カテゴリ"] == "消耗品"
    assert row["備考"] == "洗剤"


def test_update_entry_category(client):
    client.post("/api/entries", json={"month": "2026-06", "category": "消耗品", "amount": 1000})
    res = client.put("/api/entries/1", json={"amount": 1000, "category": "食費"})
    assert res.status_code == 200
    assert res.json()[0]["カテゴリ"] == "食費"


def test_update_entry_rejects_unknown_category(client):
    client.post("/api/entries", json={"month": "2026-06", "category": "消耗品", "amount": 1000})
    res = client.put("/api/entries/1", json={"amount": 1000, "category": "存在しない"})
    assert res.status_code == 400


def test_update_entry_note_can_be_cleared(client):
    client.post("/api/entries", json={"month": "2026-06", "category": "消耗品", "amount": 1000, "note": "洗剤"})
    res = client.put("/api/entries/1", json={"amount": 1000, "note": ""})
    assert res.status_code == 200
    assert res.json()[0]["備考"] == ""


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


# --------------------------------------------------------------------------- #
# 日（任意入力）: 変動費・車・バイク・投資で「その月の何日か」を記録する
# --------------------------------------------------------------------------- #
def test_create_entry_with_day(client):
    res = client.post("/api/entries", json={"month": "2026-09", "category": "食費", "amount": 1200, "day": 28})
    assert res.status_code == 200
    assert res.json()[0]["日"] == 28


def test_create_entry_without_day_is_null(client):
    res = client.post("/api/entries", json={"month": "2026-09", "category": "食費", "amount": 1200})
    assert res.status_code == 200
    assert res.json()[0]["日"] is None


def test_create_entry_with_null_day(client):
    res = client.post("/api/entries", json={"month": "2026-09", "category": "食費", "amount": 1200, "day": None})
    assert res.status_code == 200
    assert res.json()[0]["日"] is None


def test_create_entry_rejects_day_out_of_range(client):
    for day in (0, 32, -1):
        res = client.post("/api/entries", json={"month": "2026-09", "category": "食費", "amount": 1, "day": day})
        assert res.status_code == 400, day


def test_create_entry_rejects_day_beyond_month_end(client):
    """9月31日・平年の2月29日は存在しない。うるう年の2月29日は許可する。"""
    assert client.post("/api/entries", json={"month": "2026-09", "category": "食費", "amount": 1, "day": 31}).status_code == 400
    assert client.post("/api/entries", json={"month": "2026-02", "category": "食費", "amount": 1, "day": 29}).status_code == 400
    assert client.post("/api/entries", json={"month": "2028-02", "category": "食費", "amount": 1, "day": 29}).status_code == 200


def test_update_entry_day(client):
    client.post("/api/entries", json={"month": "2026-09", "category": "食費", "amount": 1000, "day": 1})
    res = client.put("/api/entries/1", json={"amount": 1000, "day": 15})
    assert res.status_code == 200
    assert res.json()[0]["日"] == 15


def test_update_entry_without_day_keeps_day(client):
    """day を送らない旧形式PUTでは日付が消えないこと（後方互換）。"""
    client.post("/api/entries", json={"month": "2026-09", "category": "食費", "amount": 1000, "day": 5})
    res = client.put("/api/entries/1", json={"amount": 2000})
    assert res.status_code == 200
    assert res.json()[0]["日"] == 5


def test_update_entry_day_can_be_cleared(client):
    client.post("/api/entries", json={"month": "2026-09", "category": "食費", "amount": 1000, "day": 5})
    res = client.put("/api/entries/1", json={"amount": 1000, "day": None})
    assert res.status_code == 200
    assert res.json()[0]["日"] is None


def test_update_entry_rejects_day_beyond_month_end(client):
    client.post("/api/entries", json={"month": "2026-09", "category": "食費", "amount": 1000})
    res = client.put("/api/entries/1", json={"amount": 1000, "day": 31})
    assert res.status_code == 400


def test_entry_has_warikan_id_field(client):
    """割り勘IDの列がJSONに出る（TypeScript版と同じ形）。反映操作自体は Worker 専用。"""
    client.post("/api/entries", json={"month": "2026-06", "category": "消耗品", "amount": 1000})
    res = client.get("/api/entries")
    assert res.json()[0]["割り勘ID"] is None
