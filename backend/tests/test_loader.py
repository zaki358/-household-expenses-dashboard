"""CSV 読み込み・検証のテスト。"""

from datetime import date

import pandas as pd
import pytest

from src.bundle_store import COMMUNICATIONS, SUBSCRIPTIONS, save_items
from src.config import DEFAULT_CONFIG
from src.loader import _normalize_month, load_data, month_fix_proposals

TODAY = date(2026, 6, 22)


@pytest.fixture
def config():
    return dict(DEFAULT_CONFIG)


@pytest.mark.parametrize("raw,expected", [
    ("2026-01", "2026-01"),
    ("2026/1", "2026-01"),
    ("2026年3月", "2026-03"),
    ("2026-12", "2026-12"),
])
def test_normalize_month(raw, expected):
    assert _normalize_month(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("6", "2026-06"),
    ("06", "2026-06"),
    ("1", "2026-01"),
    ("12", "2026-12"),
])
def test_normalize_bare_number_uses_current_year(raw, expected):
    """数字単体は実行時点の年の同月として解釈する。"""
    assert _normalize_month(raw, TODAY) == expected


@pytest.mark.parametrize("raw", ["", "   ", "nan"])
def test_normalize_blank_uses_current_month(raw):
    """空欄は実行時点の年月で補完する。"""
    assert _normalize_month(raw, TODAY) == "2026-06"


@pytest.mark.parametrize("raw", ["13", "0", "99"])
def test_normalize_out_of_range_number_raises(raw):
    """1〜12 以外の数字単体は月として解釈しない。"""
    with pytest.raises(Exception):
        _normalize_month(raw, TODAY)


def test_load_fills_blank_month_with_current(tmp_path, config):
    (tmp_path / "t.csv").write_text(
        "年月,カテゴリ,金額\n,食費,3000\n", encoding="utf-8")
    data, warnings = load_data(config, data_dir=tmp_path, today=TODAY)
    assert data["年月"].tolist() == ["2026-06"]
    assert any("空欄" in w and "2026-06" in w for w in warnings)


def test_load_bare_number_month(tmp_path, config):
    (tmp_path / "t.csv").write_text(
        "年月,カテゴリ,金額\n6,食費,3000\n", encoding="utf-8")
    data, warnings = load_data(config, data_dir=tmp_path, today=TODAY)
    assert data["年月"].tolist() == ["2026-06"]
    # 数字単体は推測ではないので空欄補完の警告は出ない
    assert not any("空欄" in w for w in warnings)


def test_month_fix_proposals(config):
    df = pd.DataFrame({
        "年月": ["2026-06", "6", "", "2026/5"],
        "カテゴリ": ["食費", "食費", "食費", "食費"],
        "金額": [1, 2, 3, 4],
    })
    props = month_fix_proposals(df, TODAY)
    after = {p["index"]: p["変更後"] for p in props}
    # 既に正しい行(0)は提案に含まれない
    assert 0 not in after
    assert after[1] == "2026-06"   # 数字単体
    assert after[2] == "2026-06"   # 空欄→当月
    assert after[3] == "2026-05"   # 表記ゆれも整う
    # 空欄行の「変更前」は分かりやすく表示する
    blank = next(p for p in props if p["index"] == 2)
    assert blank["変更前"] == "（空欄）"


def test_load_valid_csv(tmp_path, config):
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026/1,夫給与,\"280,000\"\n2026-01,家賃,85000\n",
        encoding="utf-8",
    )
    data, warnings = load_data(config, data_dir=tmp_path)
    assert len(data) == 2
    assert warnings == []
    assert data["年月"].tolist() == ["2026-01", "2026-01"]
    assert data["金額"].tolist() == [280000, 85000]
    assert data["グループ"].tolist() == ["収入", "固定費"]


def test_unknown_category_warns(tmp_path, config):
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026-01,謎の支出,1000\n", encoding="utf-8",
    )
    data, warnings = load_data(config, data_dir=tmp_path)
    assert data["グループ"].iloc[0] == "未分類"
    assert any("謎の支出" in w for w in warnings)


def test_invalid_rows_skipped_with_warning(tmp_path, config):
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\nでたらめ,家賃,85000\n2026-01,食費,えん\n2026-01,家賃,85000\n",
        encoding="utf-8",
    )
    data, warnings = load_data(config, data_dir=tmp_path)
    assert len(data) == 1
    assert len(warnings) == 2


def test_missing_columns_skips_file(tmp_path, config):
    (tmp_path / "bad.csv").write_text("日付,項目\n2026-01,家賃\n", encoding="utf-8")
    data, warnings = load_data(config, data_dir=tmp_path)
    assert data.empty
    assert any("列が不足" in w for w in warnings)


def test_empty_dir_returns_empty(tmp_path, config):
    data, warnings = load_data(config, data_dir=tmp_path)
    assert data.empty
    assert warnings == []


def test_cp932_encoding(tmp_path, config):
    (tmp_path / "sjis.csv").write_bytes(
        "年月,カテゴリ,金額\n2026-01,食費,50000\n".encode("cp932")
    )
    data, _ = load_data(config, data_dir=tmp_path)
    assert len(data) == 1
    assert data["カテゴリ"].iloc[0] == "食費"


def test_subscriptions_injected_as_monthly_bundle(tmp_path, config):
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026-01,食費,50000\n2026-02,食費,60000\n",
        encoding="utf-8",
    )
    save_items(SUBSCRIPTIONS,[
        {"年月": "2026-01", "名前": "Spotify", "金額": 1080},
        {"年月": "2026-01", "名前": "ネットフリックス", "金額": 980},
        {"年月": "2026-02", "名前": "Spotify", "金額": 1080},
    ], data_dir=tmp_path)
    data, _ = load_data(config, data_dir=tmp_path)
    sub = data[data["カテゴリ"] == "サブスク"]
    # 月ごとに1行（合計額）で注入される
    assert sub.set_index("年月")["金額"].to_dict() == {"2026-01": 2060, "2026-02": 1080}
    assert (sub["グループ"] == "固定費").all()
    # 食費2行 + サブスク2行 = 4行
    assert len(data) == 4


def test_no_subscriptions_no_injection(tmp_path, config):
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026-01,食費,50000\n", encoding="utf-8",
    )
    data, _ = load_data(config, data_dir=tmp_path)
    assert len(data) == 1
    assert "サブスク" not in data["カテゴリ"].tolist()


def test_subscription_only_month_appears(tmp_path, config):
    # CSV にデータが無い月でも、サブスクがあればその月が現れる
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026-01,食費,50000\n", encoding="utf-8",
    )
    save_items(SUBSCRIPTIONS,
        [{"年月": "2026-02", "名前": "Spotify", "金額": 1080}], data_dir=tmp_path)
    data, _ = load_data(config, data_dir=tmp_path)
    assert "2026-02" in data["年月"].tolist()


def test_subscriptions_csv_not_loaded_as_household_data(tmp_path, config):
    # dashboard_subscriptions.csv は家計データとして読み込まれない（列不足警告も出ない）
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026-01,食費,50000\n", encoding="utf-8",
    )
    save_items(SUBSCRIPTIONS,
        [{"年月": "2026-01", "名前": "Spotify", "金額": 1080}], data_dir=tmp_path)
    _, warnings = load_data(config, data_dir=tmp_path)
    assert not any("列が不足" in w for w in warnings)


def test_subscription_double_count_warns(tmp_path, config):
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026-01,サブスク,3200\n", encoding="utf-8",
    )
    save_items(SUBSCRIPTIONS,
        [{"年月": "2026-01", "名前": "Spotify", "金額": 1080}], data_dir=tmp_path)
    _, warnings = load_data(config, data_dir=tmp_path)
    assert any("サブスク" in w and "二重" in w for w in warnings)


def test_communications_injected_as_monthly_bundle(tmp_path, config):
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026-01,食費,50000\n", encoding="utf-8")
    save_items(COMMUNICATIONS, [
        {"年月": "2026-01", "名前": "自分のスマホ", "金額": 6000},
        {"年月": "2026-01", "名前": "プロバイダ", "金額": 5000},
    ], data_dir=tmp_path)
    data, _ = load_data(config, data_dir=tmp_path)
    comm = data[data["カテゴリ"] == "通信費"]
    # 月ごとに合計1行で注入され、独立グループ「通信費」になる
    assert comm["金額"].tolist() == [11000]
    assert comm["グループ"].tolist() == ["通信費"]


def test_infra_categories_map_to_infra_group(tmp_path, config):
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026-01,電気,8000\n2026-01,水道,3000\n", encoding="utf-8")
    data, warnings = load_data(config, data_dir=tmp_path)
    assert warnings == []
    groups = set(data.loc[data["カテゴリ"].isin(["電気", "水道"]), "グループ"])
    assert groups == {"インフラ"}


def test_subscription_and_communication_both_injected(tmp_path, config):
    (tmp_path / "test.csv").write_text(
        "年月,カテゴリ,金額\n2026-01,食費,50000\n", encoding="utf-8")
    save_items(SUBSCRIPTIONS,
        [{"年月": "2026-01", "名前": "Netflix", "金額": 1200}], data_dir=tmp_path)
    save_items(COMMUNICATIONS,
        [{"年月": "2026-01", "名前": "自分のスマホ", "金額": 6000}], data_dir=tmp_path)
    data, _ = load_data(config, data_dir=tmp_path)
    assert {"サブスク", "通信費"} <= set(data["カテゴリ"])
