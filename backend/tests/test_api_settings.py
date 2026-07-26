"""設定（投資の扱い・カテゴリ）APIのテスト。in-memory DB で検証する。"""


def test_get_config(client):
    res = client.get("/api/config")
    assert res.status_code == 200
    body = res.json()
    assert body["investment_as_expense"] is True
    assert "収入" in body["categories"]


def test_update_investment_mode(client):
    res = client.put("/api/config/investment-mode", json={"investment_as_expense": False})
    assert res.status_code == 200
    assert res.json()["investment_as_expense"] is False

    # 反映されている
    res = client.get("/api/config")
    assert res.json()["investment_as_expense"] is False


def test_add_category(client):
    res = client.post("/api/config/categories", json={"group": "変動費", "name": "医療費"})
    assert res.status_code == 200
    assert "医療費" in res.json()["categories"]["変動費"]


def test_add_duplicate_category_rejected(client):
    client.post("/api/config/categories", json={"group": "変動費", "name": "医療費"})
    res = client.post("/api/config/categories", json={"group": "変動費", "name": "医療費"})
    assert res.status_code == 400


def test_add_category_unknown_group_rejected(client):
    res = client.post("/api/config/categories", json={"group": "存在しないグループ", "name": "X"})
    assert res.status_code == 400


def test_delete_unused_category(client):
    res = client.delete("/api/config/categories/保険")
    assert res.status_code == 200
    assert "保険" not in res.json()["categories"]["固定費"]


def test_delete_category_in_use_rejected(client, seed):
    seed(entries=[("2026-07", "食費", 1000)])
    res = client.delete("/api/config/categories/食費")
    assert res.status_code == 400
    assert "1" in res.json()["detail"]
    # 削除されていない
    res = client.get("/api/config")
    assert "食費" in res.json()["categories"]["変動費"]


def test_delete_income_owner_category_rejected(client):
    res = client.delete("/api/config/categories/夫給与")
    assert res.status_code == 400
    # 実績0件でも income_owner 付きは保護される
    res = client.get("/api/config")
    assert "夫給与" in res.json()["categories"]["収入"]


def test_delete_bundle_label_category_rejected(client):
    res = client.delete("/api/config/categories/サブスク")
    assert res.status_code == 400
    res = client.delete("/api/config/categories/通信費")
    assert res.status_code == 400


def test_delete_nonexistent_category_rejected(client):
    res = client.delete("/api/config/categories/存在しないカテゴリ")
    assert res.status_code == 400


def test_config_out_includes_category_usage(client, seed):
    seed(entries=[("2026-07", "食費", 1000), ("2026-07", "食費", 2000)])
    res = client.get("/api/config")
    assert res.json()["category_usage"]["食費"] == 2
    assert res.json()["category_usage"].get("保険", 0) == 0
