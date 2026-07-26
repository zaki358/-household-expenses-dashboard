"""サブスク・通信費（バンドル）CRUD APIのテスト。in-memory DB で検証する。"""


def test_unknown_kind_404(client):
    res = client.get("/api/bundles/unknown")
    assert res.status_code == 404


def test_list_empty(client):
    res = client.get("/api/bundles/subscriptions")
    assert res.status_code == 200
    assert res.json() == []


def test_create_item(client):
    res = client.post("/api/bundles/subscriptions", json={"month": "2026-06", "name": "Netflix", "amount": 1490})
    assert res.status_code == 200
    assert res.json() == [{"id": 1, "年月": "2026-06", "名前": "Netflix", "金額": 1490}]


def test_create_duplicate_same_month_rejected(client):
    client.post("/api/bundles/subscriptions", json={"month": "2026-06", "name": "Netflix", "amount": 1490})
    res = client.post("/api/bundles/subscriptions", json={"month": "2026-06", "name": "Netflix", "amount": 1500})
    assert res.status_code == 400


def test_update_and_delete(client):
    client.post("/api/bundles/communications", json={"month": "2026-06", "name": "自分のスマホ", "amount": 6000})
    res = client.put("/api/bundles/communications/1", json={"amount": 6500})
    assert res.status_code == 200
    assert res.json()[0]["金額"] == 6500

    res = client.delete("/api/bundles/communications/1")
    assert res.status_code == 200
    assert res.json() == []


def test_subscriptions_and_communications_are_isolated(client):
    client.post("/api/bundles/subscriptions", json={"month": "2026-06", "name": "Netflix", "amount": 1490})
    client.post("/api/bundles/communications", json={"month": "2026-06", "name": "自分のスマホ", "amount": 6000})
    subs = client.get("/api/bundles/subscriptions").json()
    comms = client.get("/api/bundles/communications").json()
    assert [s["名前"] for s in subs] == ["Netflix"]
    assert [c["名前"] for c in comms] == ["自分のスマホ"]
