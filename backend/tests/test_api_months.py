"""翌月作成・月削除 API のテスト。in-memory DB で検証する。"""

from src.dates import add_months, current_month, next_month


def test_create_next_month_with_no_base_400(client):
    res = client.post("/api/months/next")
    assert res.status_code == 400


def test_create_next_month_carries_fixed_costs(client, seed):
    # 手入力の 2026-06（夫給与＝収入・家賃＝固定費）
    seed(entries=[
        ("2026-06", "夫給与", 280000, "manual"),
        ("2026-06", "家賃", 85000, "manual"),
    ])
    res = client.post("/api/months/next")
    assert res.status_code == 200
    assert res.json() == {"month": "2026-07"}

    # 固定費（家賃）は翌月へ引き継がれ、収入（夫給与）は引き継がれない
    carried = client.get("/api/entries", params={"month": "2026-07"}).json()
    cats = [e["カテゴリ"] for e in carried]
    assert "家賃" in cats
    assert "夫給与" not in cats


def test_create_next_month_is_idempotent(client, seed):
    seed(entries=[("2026-06", "家賃", 85000, "manual")])
    first = client.post("/api/months/next").json()
    assert first == {"month": "2026-07"}
    # もう一度呼んでも 2026-07 の家賃は二重登録されない
    client.post("/api/months/next")
    carried = client.get("/api/entries", params={"month": "2026-07", "group": "固定費"}).json()
    assert [e["カテゴリ"] for e in carried] == ["家賃"]


# --------------------------------------------------------------------------- #
# 月削除（誤って作成した翌月シートの取り消し）
#
# 「今月」判定は実行時刻基準（current_month()）なので、固定の月文字列に頼らず
# current_month() / next_month() から相対的に組み立てる。これでテスト実行日に
# 依存せず安定する。
# --------------------------------------------------------------------------- #
def test_delete_month_removes_all_three_tables(client, seed):
    today = current_month()
    future = next_month(today)
    seed(entries=[(today, "家賃", 85000, "manual")])
    seed(bundles=[("subscriptions", today, "Netflix", 1490)])
    created = client.post("/api/months/next")
    assert created.json() == {"month": future}

    res = client.delete(f"/api/months/{future}")
    assert res.status_code == 200
    body = res.json()
    assert body == {"month": future, "deleted_entries": 1, "deleted_bundle_items": 1}

    # entries・bundle_items・dashboard_months の3つとも消えていること
    assert client.get("/api/entries", params={"month": future}).json() == []
    assert client.get("/api/bundles/subscriptions", params={"month": future}).json() == []
    assert future not in client.get("/api/config").json()["dashboard_months"]


def test_delete_month_removes_import_rows_too(client, seed):
    today = current_month()
    future = next_month(today)
    seed(entries=[(future, "食費", 1200, "import")])
    res = client.delete(f"/api/months/{future}")
    assert res.status_code == 200
    assert res.json()["deleted_entries"] == 1


def test_delete_month_rejects_current_month(client):
    res = client.delete(f"/api/months/{current_month()}")
    assert res.status_code == 400


def test_delete_month_rejects_past_month(client):
    res = client.delete("/api/months/2000-01")
    assert res.status_code == 400


def test_delete_nonexistent_future_month_is_idempotent(client):
    future = next_month(next_month(current_month()))
    res = client.delete(f"/api/months/{future}")
    assert res.status_code == 200
    assert res.json() == {"month": future, "deleted_entries": 0, "deleted_bundle_items": 0}


# --------------------------------------------------------------------------- #
# 当月シートの自動準備（POST /api/months/ensure-current）
#
# アプリを開いた瞬間に当月へ固定費・サブスク・通信費を引き継ぐための経路。
# 「今月」は current_month() 基準なので、固定の月文字列に頼らず相対的に組み立てる。
# --------------------------------------------------------------------------- #
def test_ensure_current_on_empty_db_is_noop(client):
    res = client.post("/api/months/ensure-current")
    assert res.status_code == 200
    body = res.json()
    assert body["created"] is False
    assert body["base"] is None
    assert body["carried_entries"] == 0
    assert body["carried_bundle_items"] == 0
    # 幻のマーカーを作らない
    assert client.get("/api/config").json()["dashboard_months"] == []
    assert client.get("/api/summary").json()["months"] == []


def test_ensure_current_carries_fixed_costs_and_bundles(client, seed):
    prev = add_months(current_month(), -1)
    seed(
        entries=[(prev, "夫給与", 280000, "manual"), (prev, "家賃", 85000, "manual")],
        bundles=[("subscriptions", prev, "Netflix", 1490), ("communications", prev, "自分のスマホ", 6000)],
    )
    res = client.post("/api/months/ensure-current")
    assert res.status_code == 200
    body = res.json()
    assert body["created"] is True
    assert body["base"] == prev
    assert body["carried_entries"] == 1
    assert body["carried_bundle_items"] == 2

    today = current_month()
    cats = [e["カテゴリ"] for e in client.get("/api/entries", params={"month": today}).json()]
    assert "家賃" in cats
    assert "夫給与" not in cats  # 収入は引き継がれない
    subs = client.get("/api/bundles/subscriptions", params={"month": today}).json()
    assert [s["名前"] for s in subs] == ["Netflix"]
    comms = client.get("/api/bundles/communications", params={"month": today}).json()
    assert [c["名前"] for c in comms] == ["自分のスマホ"]


def test_ensure_current_is_idempotent(client, seed):
    prev = add_months(current_month(), -1)
    seed(entries=[(prev, "家賃", 85000, "manual")])
    first = client.post("/api/months/ensure-current")
    assert first.json()["created"] is True
    second = client.post("/api/months/ensure-current")
    assert second.json()["created"] is False

    today = current_month()
    fixed = client.get("/api/entries", params={"month": today, "group": "固定費"}).json()
    assert [e["カテゴリ"] for e in fixed] == ["家賃"]  # 二重登録されない


def test_ensure_current_does_not_recarry_after_deliberate_delete(client, seed):
    prev = add_months(current_month(), -1)
    seed(entries=[(prev, "家賃", 85000, "manual")], bundles=[("subscriptions", prev, "Netflix", 1490)])
    client.post("/api/months/ensure-current")

    today = current_month()
    for e in client.get("/api/entries", params={"month": today}).json():
        client.delete(f"/api/entries/{e['id']}")
    for s in client.get("/api/bundles/subscriptions", params={"month": today}).json():
        client.delete(f"/api/bundles/subscriptions/{s['id']}")

    res = client.post("/api/months/ensure-current")
    assert res.json()["created"] is False
    assert client.get("/api/entries", params={"month": today}).json() == []
    assert client.get("/api/bundles/subscriptions", params={"month": today}).json() == []


def test_ensure_current_skips_month_already_prepared_by_button(client, seed):
    prev = add_months(current_month(), -1)
    seed(entries=[(prev, "家賃", 85000, "manual")])
    created = client.post("/api/months/next")
    assert created.json() == {"month": current_month()}

    res = client.post("/api/months/ensure-current")
    assert res.json()["created"] is False

    today = current_month()
    fixed = client.get("/api/entries", params={"month": today, "group": "固定費"}).json()
    assert [e["カテゴリ"] for e in fixed] == ["家賃"]  # 重複しない


def test_ensure_current_uses_latest_data_month_as_base_across_a_gap(client, seed):
    old = add_months(current_month(), -3)
    seed(entries=[(old, "家賃", 85000, "manual")])
    res = client.post("/api/months/ensure-current")
    body = res.json()
    assert body["created"] is True
    assert body["base"] == old

    today = current_month()
    fixed = client.get("/api/entries", params={"month": today, "group": "固定費"}).json()
    assert [e["カテゴリ"] for e in fixed] == ["家賃"]

    # 間の月は作られない
    months = client.get("/api/summary").json()["months"]
    assert add_months(current_month(), -2) not in months
    assert add_months(current_month(), -1) not in months


def test_create_next_month_ignores_empty_prepared_month_as_base(client, seed):
    prev = add_months(current_month(), -1)
    future = add_months(current_month(), 6)
    # future は中身の無い「準備済み月」（例: 誤って先まで作ってしまった月）
    seed(entries=[(prev, "家賃", 85000, "manual")], months=[future])

    res = client.post("/api/months/next")
    assert res.status_code == 200
    target = add_months(future, 1)
    assert res.json() == {"month": target}

    # 旧実装は base が空の future になり何も引き継がなかった。今は prev から正しく引き継ぐ。
    fixed = client.get("/api/entries", params={"month": target, "group": "固定費"}).json()
    assert [e["カテゴリ"] for e in fixed] == ["家賃"]
