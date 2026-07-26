"""ダッシュボード入力データ（専用CSV）の管理テスト。"""

import pytest

from src.config import DEFAULT_CONFIG
from src.entries import (
    add_entry,
    entries_for_group,
    entries_path,
    load_entries,
    remove_entry,
    save_entries,
    update_entry,
)
from src.loader import load_data


@pytest.fixture
def config():
    return dict(DEFAULT_CONFIG)


def test_load_empty_when_no_file(tmp_path):
    assert load_entries(data_dir=tmp_path) == []


def test_add_entry_returns_new_list_immutably(config):
    entries = []
    updated = add_entry(config, entries, "2026-06", "夫給与", 280000)
    assert updated == [{"年月": "2026-06", "カテゴリ": "夫給与", "金額": 280000}]
    # 元のリストは変更しない（イミュータブル）
    assert entries == []


def test_add_entry_normalizes_month(config):
    updated = add_entry(config, [], "2026年6月", "NISA", 30000)
    assert updated[0]["年月"] == "2026-06"


def test_add_entry_rejects_unknown_category(config):
    with pytest.raises(ValueError):
        add_entry(config, [], "2026-06", "存在しないカテゴリ", 1000)


def test_add_entry_rejects_non_positive_amount(config):
    with pytest.raises(ValueError):
        add_entry(config, [], "2026-06", "食費", 0)
    with pytest.raises(ValueError):
        add_entry(config, [], "2026-06", "食費", -100)


def test_add_entry_rejects_bad_month(config):
    with pytest.raises(ValueError):
        add_entry(config, [], "でたらめ", "食費", 1000)


def test_add_entry_rejects_non_numeric_amount(config):
    with pytest.raises(ValueError):
        add_entry(config, [], "2026-06", "食費", "abc")


def test_save_and_load_roundtrip(config, tmp_path):
    entries = add_entry(config, [], "2026-06", "夫給与", 280000)
    entries = add_entry(config, entries, "2026-06", "NISA", 30000)
    save_entries(entries, data_dir=tmp_path)
    assert entries_path(tmp_path).exists()
    loaded = load_entries(data_dir=tmp_path)
    assert loaded == entries


def test_remove_entry_by_index(config):
    entries = add_entry(config, [], "2026-06", "夫給与", 280000)
    entries = add_entry(config, entries, "2026-06", "NISA", 30000)
    removed = remove_entry(entries, 0)
    assert removed == [{"年月": "2026-06", "カテゴリ": "NISA", "金額": 30000}]
    # 元は不変
    assert len(entries) == 2


def test_update_entry_amount(config):
    entries = add_entry(config, [], "2026-06", "家賃", 85000)
    updated = update_entry(entries, 0, 90000)
    assert updated[0]["金額"] == 90000
    # 元は不変
    assert entries[0]["金額"] == 85000


def test_update_entry_rejects_non_positive(config):
    entries = add_entry(config, [], "2026-06", "家賃", 85000)
    with pytest.raises(ValueError):
        update_entry(entries, 0, 0)


def test_entries_for_group_filters_by_month_and_group(config):
    entries = add_entry(config, [], "2026-06", "夫給与", 280000)
    entries = add_entry(config, entries, "2026-06", "家賃", 85000)
    entries = add_entry(config, entries, "2026-07", "家賃", 85000)
    fixed_june = entries_for_group(entries, config, "2026-06", "固定費")
    assert [e["カテゴリ"] for _, e in fixed_june] == ["家賃"]
    assert [i for i, _ in fixed_june] == [1]
    income_june = entries_for_group(entries, config, "2026-06", "収入")
    assert [e["カテゴリ"] for _, e in income_june] == ["夫給与"]


def test_entries_flow_through_load_data(config, tmp_path):
    """専用CSVに保存した入力は loader が自動で読み込み、集計に反映される。"""
    entries = add_entry(config, [], "2026-06", "夫給与", 280000)
    entries = add_entry(config, entries, "2026-06", "家賃", 85000)
    save_entries(entries, data_dir=tmp_path)

    data, warnings = load_data(config, data_dir=tmp_path)
    assert warnings == []
    assert len(data) == 2
    assert set(data["カテゴリ"]) == {"夫給与", "家賃"}
    assert data.loc[data["カテゴリ"] == "夫給与", "グループ"].iloc[0] == "収入"
    assert data.loc[data["カテゴリ"] == "家賃", "グループ"].iloc[0] == "固定費"
