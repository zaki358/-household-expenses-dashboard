"""目標達成状況の計算テスト（list[dict] ベース）。"""

import pytest

from src.dates import add_months
from src.goal import goal_status


def make_summary(savings_per_month: list[float], invest_per_month: list[float] | None = None):
    invest = invest_per_month or [0] * len(savings_per_month)
    rows = []
    cum_s = 0.0
    cum_i = 0.0
    for i, (s, iv) in enumerate(zip(savings_per_month, invest)):
        cum_s += s
        cum_i += iv
        rows.append({
            "年月": add_months("2026-01", i),
            "貯金": float(s), "投資": float(iv),
            "累計貯金": cum_s, "投資累計": cum_i, "純資産": cum_s + cum_i,
        })
    return rows


def status(summary, target, source="savings"):
    return goal_status(summary, {"name": "テスト目標", "target_amount": target, "source": source})


def test_progress_rate_and_remaining():
    summary = make_summary([100000] * 5)  # 累計50万
    s = status(summary, 1000000)
    assert s["名前"] == "テスト目標"
    assert s["現在額"] == 500000
    assert s["達成率"] == pytest.approx(50.0)
    assert s["残額"] == 500000


def test_estimated_completion_date():
    # 累計50万、残り50万、ペース10万/月 → 5ヶ月後 (2026-05 → 2026-10)
    summary = make_summary([100000] * 5)
    assert status(summary, 1000000)["予想達成日"] == "2026-10"


def test_negative_pace_returns_no_eta():
    summary = make_summary([-50000] * 3)
    assert status(summary, 1000000)["予想達成日"] is None


def test_negative_savings_clamps_rate_to_zero():
    summary = make_summary([-6800])  # 累計貯金 -6800
    s = status(summary, 4000000)
    assert s["現在額"] == -6800  # 真の現在額は保持する
    assert s["達成率"] == 0.0  # 達成率はマイナスにしない
    assert 0.0 <= s["達成率"] / 100 <= 1.0


def test_already_achieved():
    summary = make_summary([600000, 600000])  # 累計120万 > 目標100万
    s = status(summary, 1000000)
    assert s["残額"] == 0
    assert s["達成率"] == 100.0


def test_net_worth_source_includes_investment():
    summary = make_summary([100000] * 3, [50000] * 3)  # 貯金30万 + 投資15万
    assert status(summary, 1000000, source="net_worth")["現在額"] == 450000


def test_empty_summary():
    s = goal_status([], {"name": "X", "target_amount": 1000000})
    assert s["現在額"] == 0
    assert s["予想達成日"] is None
