"""目標 API のテスト。in-memory DB で検証する。"""


def test_list_goals_empty_by_default(client):
    res = client.get("/api/goals")
    assert res.status_code == 200
    assert res.json() == []


def test_create_goal(client):
    res = client.post("/api/goals", json={"name": "車の買い替え", "target_amount": 1500000, "source": "savings"})
    assert res.status_code == 200
    names = {g["name"] for g in res.json()}
    assert "車の買い替え" in names


def test_create_duplicate_goal_rejected(client):
    client.post("/api/goals", json={"name": "旅行", "target_amount": 500000})
    res = client.post("/api/goals", json={"name": "旅行", "target_amount": 600000})
    assert res.status_code == 400


def test_delete_goal(client):
    client.post("/api/goals", json={"name": "旅行", "target_amount": 500000})
    res = client.delete("/api/goals/旅行")
    assert res.status_code == 200
    assert all(g["name"] != "旅行" for g in res.json())


def test_set_active_goal(client):
    client.post("/api/goals", json={"name": "車の買い替え", "target_amount": 1500000})
    res = client.put("/api/goals/active", json={"name": "車の買い替え"})
    assert res.status_code == 200


def test_set_active_unknown_goal_400(client):
    res = client.put("/api/goals/active", json={"name": "存在しない"})
    assert res.status_code == 400


def test_status_none_when_no_goals(client):
    res = client.get("/api/goals/status")
    assert res.status_code == 200
    assert res.json() is None


def test_status_with_data(client, seed):
    seed(entries=[("2026-01", "夫給与", 500000), ("2026-01", "食費", 100000)])
    client.post("/api/goals", json={"name": "結婚資金", "target_amount": 3000000, "source": "savings"})
    res = client.get("/api/goals/status")
    assert res.status_code == 200
    body = res.json()
    assert body["名前"] == "結婚資金"
    assert body["現在額"] == 400000  # 50万 - 10万
