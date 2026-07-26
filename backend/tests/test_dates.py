"""年月正規化・加算（src.dates）のテスト（pandas.Period 代替の回帰担保）。"""

from datetime import date

import pytest

from src.dates import add_months, next_month, normalize_month

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
