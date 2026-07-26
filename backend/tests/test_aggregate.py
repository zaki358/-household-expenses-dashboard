"""月次集計と KPI 計算のテスト（list[dict] ベース）。"""

import pytest

from src.aggregate import compare_months, expense_breakdown, monthly_summary, previous_month
from src.config import DEFAULT_CONFIG


@pytest.fixture
def config():
    return dict(DEFAULT_CONFIG)


def _rows(triples):
    return [{"年月": m, "カテゴリ": c, "グループ": g, "金額": float(a)} for m, c, g, a in triples]


@pytest.fixture
def data():
    return _rows([
        # 2026-01: 収入50万 / 支出20万 / 投資3万
        ("2026-01", "夫給与", "収入", 300000),
        ("2026-01", "妻給与", "収入", 200000),
        ("2026-01", "家賃", "固定費", 150000),
        ("2026-01", "食費", "変動費", 50000),
        ("2026-01", "NISA", "投資", 30000),
        # 2026-02: 収入52万 / 支出25万 / 投資5万
        ("2026-02", "夫給与", "収入", 300000),
        ("2026-02", "妻給与", "収入", 200000),
        ("2026-02", "ボーナス", "収入", 20000),
        ("2026-02", "家賃", "固定費", 150000),
        ("2026-02", "食費", "変動費", 100000),
        ("2026-02", "NISA", "投資", 50000),
    ])


def test_monthly_savings_is_cash_based(data, config):
    summary = monthly_summary(data, config)
    jan = summary[0]
    # 貯金 = 50万 - 20万 - 3万 = 27万
    assert jan["貯金"] == 270000


def test_expense_includes_investment_when_configured(data, config):
    summary = monthly_summary(data, {**config, "investment_as_expense": True})
    assert summary[0]["支出"] == 230000  # 20万 + 投資3万


def test_expense_excludes_investment_as_asset_transfer(data, config):
    summary = monthly_summary(data, {**config, "investment_as_expense": False})
    assert summary[0]["支出"] == 200000
    # 貯金額は扱いに関係なく同じ
    assert summary[0]["貯金"] == 270000


def test_cumulative_and_net_worth(data, config):
    summary = monthly_summary(data, config)
    feb = summary[1]
    # 2月貯金 = 52万 - 25万 - 5万 = 22万 → 累計 27+22 = 49万
    assert feb["累計貯金"] == 490000
    assert feb["投資累計"] == 80000
    assert feb["純資産"] == 570000


def test_husband_wife_income_split(data, config):
    summary = monthly_summary(data, config)
    feb = summary[1]
    assert feb["夫収入"] == 300000
    assert feb["妻収入"] == 200000
    assert feb["収入"] == 520000  # ボーナス2万は合算のみに含まれる


def test_compare_months(data, config):
    summary = monthly_summary(data, config)
    comparison = compare_months(summary, "2026-02")
    income = next(r for r in comparison if r["項目"] == "収入")
    assert income["差額"] == 20000
    assert income["増減率"] == pytest.approx(4.0)


def test_compare_first_month_returns_none(data, config):
    summary = monthly_summary(data, config)
    assert compare_months(summary, "2026-01") is None
    assert previous_month(summary, "2026-02") == "2026-01"


def test_expense_breakdown_excludes_income(data, config):
    breakdown = expense_breakdown(data, config, "2026-01")
    cats = [r["カテゴリ"] for r in breakdown]
    assert "夫給与" not in cats
    assert "NISA" in cats  # 投資=支出モード


def test_empty_data_returns_empty_summary(config):
    assert monthly_summary([], config) == []


def test_expense_breakdown_shows_subscription_as_single_slice(config):
    """サブスクは repo が合計1行で注入するため、円グラフでは1スライスになる。"""
    data = _rows([
        ("2026-01", "家賃", "固定費", 80000),
        ("2026-01", "サブスク", "固定費", 2070),
    ])
    breakdown = expense_breakdown(data, config, "2026-01")
    subs = [r for r in breakdown if r["カテゴリ"] == "サブスク"]
    assert len(subs) == 1
    assert subs[0]["金額"] == 2070


def test_summary_includes_empty_ensure_months(config):
    """翌月作成直後でデータが無い月も 0 埋めで含める。"""
    data = _rows([("2026-01", "夫給与", "収入", 300000)])
    summary = monthly_summary(data, config, ensure_months=["2026-01", "2026-02"])
    assert [r["年月"] for r in summary] == ["2026-01", "2026-02"]
    feb = next(r for r in summary if r["年月"] == "2026-02")
    assert feb["収入"] == 0
    assert feb["貯金"] == 0
    # 累計貯金は前月分を引き継ぐ
    assert feb["累計貯金"] == 300000


def test_summary_empty_data_with_ensure_months(config):
    summary = monthly_summary([], config, ensure_months=["2026-03"])
    assert [r["年月"] for r in summary] == ["2026-03"]
    assert summary[0]["貯金"] == 0
