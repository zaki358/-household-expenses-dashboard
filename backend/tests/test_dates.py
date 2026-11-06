"""年月正規化・加算（src.dates）のテスト（pandas.Period 代替の回帰担保）。"""

from datetime import date, datetime, timezone

import pytest

from src.dates import add_months, current_month, days_in_month, next_month, normalize_month

TODAY = date(2026, 7, 18)


@pytest.mark.parametrize("value,expected", [
    ("2026-01", "2026-01"),
    ("2026-1", "2026-01"),
    ("2026/1", "2026-01"),
    ("2026/01", "2026-01"),
    ("2026年1月", "2026-01"),
    ("2026年12月", "2026-12"),
    (" 2026-03 ", "2026-03"),
])
def test_normalize_explicit_month(value, expected):
    assert normalize_month(value, today=TODAY) == expected


@pytest.mark.parametrize("value,expected", [
    ("6", "2026-06"),
    ("06", "2026-06"),
    ("1", "2026-01"),
    ("12", "2026-12"),
])
def test_normalize_bare_number_uses_current_year(value, expected):
    assert normalize_month(value, today=TODAY) == expected


@pytest.mark.parametrize("value", ["", "   ", "nan"])
def test_normalize_blank_uses_current_month(value):
    assert normalize_month(value, today=TODAY) == "2026-07"


@pytest.mark.parametrize("value", ["abc", "2026-13", "2026-00"])
def test_normalize_invalid_raises(value):
    with pytest.raises(ValueError):
        normalize_month(value, today=TODAY)


@pytest.mark.parametrize("month,expected", [
    ("2026-06", "2026-07"),
    ("2026-12", "2027-01"),
])
def test_next_month(month, expected):
    assert next_month(month) == expected


@pytest.mark.parametrize("month,n,expected", [
    ("2026-05", 5, "2026-10"),
    ("2026-01", 0, "2026-01"),
    ("2026-01", 12, "2027-01"),
    ("2026-03", -3, "2025-12"),
])
def test_add_months(month, n, expected):
    assert add_months(month, n) == expected


def test_current_month_within_same_utc_day():
    # UTC 2026-07-27 10:00 → JST 2026-07-27 19:00 (同日)
    now = datetime(2026, 7, 27, 10, 0, tzinfo=timezone.utc)
    assert current_month(now) == "2026-07"


def test_current_month_crosses_utc_day_boundary():
    # UTC 2026-07-31 15:00 → JST 2026-08-01 00:00（月またぎ）
    # Worker は UTC で動くため、素朴に月を出すと 07 のままズレる。+9時間を通す必要がある。
    now = datetime(2026, 7, 31, 15, 0, tzinfo=timezone.utc)
    assert current_month(now) == "2026-08"


def test_current_month_just_before_utc_day_boundary_stays_in_previous_month():
    # UTC 2026-07-31 14:59 → JST 2026-07-31 23:59（まだ月内）
    now = datetime(2026, 7, 31, 14, 59, tzinfo=timezone.utc)
    assert current_month(now) == "2026-07"


def test_current_month_treats_naive_datetime_as_utc():
    now = datetime(2026, 7, 31, 15, 0)  # tzinfo無し
    assert current_month(now) == "2026-08"


@pytest.mark.parametrize(
    "month, expected",
    [("2026-01", 31), ("2026-09", 30), ("2026-02", 28), ("2028-02", 29), ("2100-02", 28), ("2000-02", 29)],
)
def test_days_in_month(month, expected):
    assert days_in_month(month) == expected
