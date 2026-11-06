"""年月(YYYY-MM)の正規化・加算ユーティリティ（pandas.Period の代替）。

Cloudflare Python Workers では pandas が使えないため、月の計算を
標準ライブラリだけで行う。挙動は旧 loader._normalize_month / months.next_month
と一致させる。
"""

import calendar
from datetime import date, datetime, timedelta, timezone


def _is_blank(value) -> bool:
    """空欄（空文字・空白のみ・NaN）かどうかを判定する。"""
    return str(value).strip().lower() in ("", "nan")


def normalize_month(value, today: date | None = None) -> str:
    """年月を YYYY-MM に正規化する。

    対応する入力:
    - 「2026-01」「2026/1」「2026年1月」など → そのまま正規化
    - 数字単体「6」「06」（1〜12） → 実行時点の年の同月（例: 2026-06）
    - 空欄（空文字・NaN） → 実行時点の年月

    解釈できない場合は ValueError を送出する。
    """
    today = today or date.today()
    text = str(value).strip()
    if _is_blank(text):
        return f"{today.year:04d}-{today.month:02d}"
    if text.isdigit() and 1 <= int(text) <= 12:
        return f"{today.year:04d}-{int(text):02d}"

    normalized = text.replace("年", "-").replace("月", "").replace("/", "-").strip("-")
    parts = [p for p in normalized.split("-") if p != ""]
    if not parts:
        raise ValueError(f"年月を解釈できません: {value!r}")
    year = int(parts[0])  # 非数値なら ValueError
    month = int(parts[1]) if len(parts) > 1 else 1
    if not (1 <= month <= 12):
        raise ValueError(f"月が範囲外です: {value!r}")
    return f"{year:04d}-{month:02d}"


def add_months(month: str, n: int) -> str:
    """「2026-06」に n ヶ月足した YYYY-MM を返す（n は負も可）。"""
    year, mon = (int(x) for x in str(month).strip().split("-")[:2])
    index = (year * 12 + (mon - 1)) + n
    new_year, new_mon = divmod(index, 12)
    return f"{new_year:04d}-{new_mon + 1:02d}"


def next_month(month: str) -> str:
    """「2026-06」→「2026-07」のように翌月を返す。"""
    return add_months(month, 1)


def days_in_month(month: str) -> int:
    """「2026-02」→ 28 のように、その月の日数（うるう年考慮）を返す。"""
    year, mon = (int(x) for x in str(month).strip().split("-")[:2])
    return calendar.monthrange(year, mon)[1]


def current_month(now: datetime | None = None) -> str:
    """JST(UTC+9)基準の今月 YYYY-MM。

    TypeScript版（worker/src/dates.ts の currentMonth）と挙動を揃える。
    Worker は UTC で動くため明示的にオフセットする必要があり、こちらも
    now を UTC とみなして +9時間する（naive な now は UTC 扱い）。
    テストでは UTC 15:00（= JST 翌日 00:00）のような日付境界ケースを
    now に渡して検証できる。
    """
    if now is None:
        now = datetime.now(timezone.utc)
    base = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
    jst = base.astimezone(timezone.utc) + timedelta(hours=9)
    return f"{jst.year:04d}-{jst.month:02d}"
