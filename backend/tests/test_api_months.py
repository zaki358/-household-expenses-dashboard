"""翌月作成 API のテスト。in-memory DB で検証する。"""


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
