"""翌月作成・引き継ぎのテスト。"""

import pytest

from src.bundle_store import COMMUNICATIONS, SUBSCRIPTIONS, load_items, save_items
from src.config import DEFAULT_CONFIG
from src.entries import load_entries, save_entries
from src.months import (
    carry_over_fixed_costs,
    create_next_month,
    next_month,
    registered_months,
)


@pytest.fixture
def config():
    return dict(DEFAULT_CONFIG)


@pytest.mark.parametrize("month,expected", [
    ("2026-06", "2026-07"),
    ("2026-12", "2027-01"),
    ("2026-01", "2026-02"),
])
def test_next_month(month, expected):
    assert next_month(month) == expected


def test_carry_over_fixed_costs_only(config):
    entries = [
        {"年月": "2026-06", "カテゴリ": "夫給与", "金額": 280000},   # 収入: 引き継がない
        {"年月": "2026-06", "カテゴリ": "家賃", "金額": 85000},       # 固定費: 引き継ぐ
        {"年月": "2026-06", "カテゴリ": "保険", "金額": 6000},        # 固定費: 引き継ぐ
        {"年月": "2026-06", "カテゴリ": "電気", "金額": 8000},        # インフラ: 引き継がない
        {"年月": "2026-06", "カテゴリ": "NISA", "金額": 30000},      # 投資: 引き継がない
    ]
    carried = carry_over_fixed_costs(entries, config, "2026-06", "2026-07")
    july = [e for e in carried if e["年月"] == "2026-07"]
    assert {e["カテゴリ"] for e in july} == {"家賃", "保険"}
    assert all(e["金額"] in (85000, 6000) for e in july)


def test_carry_over_fixed_costs_noop_when_target_has_fixed(config):
    entries = [
        {"年月": "2026-06", "カテゴリ": "家賃", "金額": 85000},
        {"年月": "2026-07", "カテゴリ": "家賃", "金額": 90000},
    ]
    carried = carry_over_fixed_costs(entries, config, "2026-06", "2026-07")
    assert carried == entries


def test_create_next_month_carries_fixed_and_subs(config, tmp_path):
    save_entries([
        {"年月": "2026-06", "カテゴリ": "夫給与", "金額": 280000},
        {"年月": "2026-06", "カテゴリ": "家賃", "金額": 85000},
        {"年月": "2026-06", "カテゴリ": "電気", "金額": 8000},  # インフラ: 引き継がない
    ], data_dir=tmp_path)
    save_items(SUBSCRIPTIONS,
        [{"年月": "2026-06", "名前": "Netflix", "金額": 1200}], data_dir=tmp_path)
    save_items(COMMUNICATIONS,
        [{"年月": "2026-06", "名前": "自分のスマホ", "金額": 6000}], data_dir=tmp_path)

    new_config, target = create_next_month(config, ["2026-06"], data_dir=tmp_path)
    assert target == "2026-07"
    assert "2026-07" in registered_months(new_config)

    entries = load_entries(data_dir=tmp_path)
    july_entries = [e for e in entries if e["年月"] == "2026-07"]
    # 固定費（家賃）は引き継ぐが、収入・インフラは引き継がない
    assert {e["カテゴリ"] for e in july_entries} == {"家賃"}

    subs = load_items(SUBSCRIPTIONS, data_dir=tmp_path)
    assert {s["名前"] for s in subs if s["年月"] == "2026-07"} == {"Netflix"}

    comms = load_items(COMMUNICATIONS, data_dir=tmp_path)
    assert {s["名前"] for s in comms if s["年月"] == "2026-07"} == {"自分のスマホ"}


def test_create_next_month_uses_registry_as_latest(config, tmp_path):
    # 登録済み月が最新なら、その翌月を作る
    cfg = {**config, "dashboard_months": ["2026-08"]}
    _, target = create_next_month(cfg, ["2026-06"], data_dir=tmp_path)
    assert target == "2026-09"


def test_create_next_month_raises_when_no_base(config, tmp_path):
    with pytest.raises(ValueError):
        create_next_month(config, [], data_dir=tmp_path)
