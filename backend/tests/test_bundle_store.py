"""月ごとバンドル（サブスク・通信費）ストアのテスト。"""

import pytest

from src.bundle_store import (
    COMMUNICATIONS,
    SUBSCRIPTIONS,
    add_item,
    bundle_filenames,
    carry_over,
    injected_rows,
    items_for_month,
    load_items,
    month_total,
    months_with_items,
    remove_item,
    save_items,
    update_amount,
)


def test_load_empty_when_no_file(tmp_path):
    assert load_items(SUBSCRIPTIONS, data_dir=tmp_path) == []
    assert load_items(COMMUNICATIONS, data_dir=tmp_path) == []


def test_bundle_filenames_distinct():
    assert SUBSCRIPTIONS.filename != COMMUNICATIONS.filename
    assert set(bundle_filenames()) == {
        "dashboard_subscriptions.csv", "dashboard_communications.csv"}


def test_add_and_immutable():
    items = []
    updated = add_item(items, "2026-06", "自分のスマホ", 6000)
    assert updated == [{"年月": "2026-06", "名前": "自分のスマホ", "金額": 6000}]
    assert items == []


def test_add_duplicate_same_month_raises():
    items = add_item([], "2026-06", "プロバイダ", 5000)
    with pytest.raises(ValueError):
        add_item(items, "2026-06", "プロバイダ", 4800)


def test_same_name_different_month_ok():
    items = add_item([], "2026-06", "妻のスマホ", 4000)
    items = add_item(items, "2026-07", "妻のスマホ", 4000)
    assert len(items) == 2


def test_add_validations():
    with pytest.raises(ValueError):
        add_item([], "2026-06", "  ", 1000)
    with pytest.raises(ValueError):
        add_item([], "2026-06", "X", 0)
    with pytest.raises(ValueError):
        add_item([], "2026-06", "Y", "abc")


def test_update_and_remove():
    items = add_item([], "2026-06", "自分のスマホ", 6000)
    items = add_item(items, "2026-06", "妻のスマホ", 4000)
    updated = update_amount(items, 0, 6500)
    assert updated[0]["金額"] == 6500
    assert items[0]["金額"] == 6000  # 元は不変
    removed = remove_item(items, 0)
    assert [s["名前"] for s in removed] == ["妻のスマホ"]


def test_month_helpers():
    items = [
        {"年月": "2026-06", "名前": "自分のスマホ", "金額": 6000},
        {"年月": "2026-06", "名前": "妻のスマホ", "金額": 4000},
        {"年月": "2026-07", "名前": "自分のスマホ", "金額": 6000},
    ]
    assert month_total(items, "2026-06") == 10000
    assert months_with_items(items) == ["2026-06", "2026-07"]
    assert [i for i, _ in items_for_month(items, "2026-07")] == [2]


def test_carry_over_duplicates_to_new_month():
    items = [
        {"年月": "2026-06", "名前": "自分のスマホ", "金額": 6000},
        {"年月": "2026-06", "名前": "プロバイダ", "金額": 5000},
    ]
    carried = carry_over(items, "2026-06", "2026-07")
    assert month_total(carried, "2026-07") == 11000


def test_carry_over_noop_when_target_exists():
    items = [
        {"年月": "2026-06", "名前": "自分のスマホ", "金額": 6000},
        {"年月": "2026-07", "名前": "自分のスマホ", "金額": 6500},
    ]
    assert carry_over(items, "2026-06", "2026-07") == items


def test_injected_rows_bundles_per_month():
    items = [
        {"年月": "2026-06", "名前": "自分のスマホ", "金額": 6000},
        {"年月": "2026-06", "名前": "妻のスマホ", "金額": 4000},
        {"年月": "2026-07", "名前": "自分のスマホ", "金額": 6000},
    ]
    rows = injected_rows(COMMUNICATIONS, items)
    by_month = {r["年月"]: r for r in rows}
    assert by_month["2026-06"]["金額"] == 10000
    assert by_month["2026-06"]["カテゴリ"] == "通信費"
    assert by_month["2026-06"]["グループ"] == "通信費"
    assert by_month["2026-07"]["金額"] == 6000


def test_subscriptions_spec_injects_under_fixed_costs():
    items = [{"年月": "2026-06", "名前": "Netflix", "金額": 1200}]
    rows = injected_rows(SUBSCRIPTIONS, items)
    assert rows[0]["カテゴリ"] == "サブスク"
    assert rows[0]["グループ"] == "固定費"


def test_save_load_roundtrip_per_spec(tmp_path):
    subs = add_item([], "2026-06", "Netflix", 1200)
    comms = add_item([], "2026-06", "自分のスマホ", 6000)
    save_items(SUBSCRIPTIONS, subs, data_dir=tmp_path)
    save_items(COMMUNICATIONS, comms, data_dir=tmp_path)
    # それぞれ別ファイルに保存され、混ざらない
    assert load_items(SUBSCRIPTIONS, data_dir=tmp_path) == subs
    assert load_items(COMMUNICATIONS, data_dir=tmp_path) == comms
