"""読み取り専用API（/api/summary, /api/dashboard, /api/charts）のテスト。

in-memory DB（conftest の client / seed）で検証する。
"""

_SAMPLE = [
    ("2026-01", "夫給与", 300000),
    ("2026-01", "妻給与", 200000),
    ("2026-01", "家賃", 150000),
    ("2026-01", "食費", 50000),
    ("2026-01", "NISA", 30000),
    ("2026-02", "夫給与", 300000),
    ("2026-02", "妻給与", 200000),
    ("2026-02", "ボーナス", 20000),
    ("2026-02", "家賃", 150000),
    ("2026-02", "食費", 100000),
    ("2026-02", "NISA", 50000),
]


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_summary_empty_data_returns_empty_lists(client):
    res = client.get("/api/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["months"] == []
    assert body["summary"] == []
    assert body["warnings"] == []


def test_summary_matches_known_calculation(client, seed):
    seed(entries=_SAMPLE)
    res = client.get("/api/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["months"] == ["2026-01", "2026-02"]
    jan = body["summary"][0]
    assert jan["貯金"] == 270000
    feb = body["summary"][1]
    assert feb["累計貯金"] == 490000
    assert feb["純資産"] == 570000


def test_dashboard_defaults_to_latest_month(client, seed):
    seed(entries=_SAMPLE)
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    body = res.json()
    assert body["month"] == "2026-02"
    assert body["current"]["貯金"] == 220000  # 52万-25万-5万
    assert body["comparison"] is not None
    income_row = next(r for r in body["comparison"] if r["項目"] == "収入")
    assert income_row["差額"] == 20000


def test_dashboard_first_month_has_no_comparison(client, seed):
    seed(entries=_SAMPLE)
    res = client.get("/api/dashboard", params={"month": "2026-01"})
    assert res.status_code == 200
    assert res.json()["comparison"] is None


def test_dashboard_unknown_month_404(client, seed):
    seed(entries=_SAMPLE)
    res = client.get("/api/dashboard", params={"month": "2099-01"})
    assert res.status_code == 404


def test_dashboard_no_data_404(client):
    res = client.get("/api/dashboard")
    assert res.status_code == 404


def test_charts_returns_breakdown_and_trend(client, seed):
    seed(entries=_SAMPLE)
    res = client.get("/api/charts", params={"month": "2026-02"})
    assert res.status_code == 200
    body = res.json()
    assert body["month"] == "2026-02"
    categories = {row["カテゴリ"] for row in body["expense_breakdown"]}
    assert "家賃" in categories
    assert "夫給与" not in categories  # 収入は除外される
    assert len(body["trend"]) == 2
    assert body["group_totals_previous"]  # 前月データがあるので空ではない


def test_charts_first_month_has_empty_previous_totals(client, seed):
    seed(entries=_SAMPLE)
    res = client.get("/api/charts", params={"month": "2026-01"})
    assert res.status_code == 200
    assert res.json()["group_totals_previous"] == []
