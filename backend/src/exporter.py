"""D1/SQLite → CSV 書き出し。

レガシー（旧CSV版）と同じヘッダ・エンコーディング（utf-8-sig）で出力するので、
既存の kakei-check（会計検証）フローがそのまま使える。
"""

import csv
import io


def _to_csv(header: list[str], rows: list[list]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    return buf.getvalue()


async def export_entries_csv(db) -> str:
    """全 entries（手入力＋取込）を 年月,カテゴリ,金額,備考 のCSV文字列で返す。"""
    rows = await db.all("SELECT month, category, amount, note FROM entries ORDER BY month, id")
    return _to_csv(["年月", "カテゴリ", "金額", "備考"],
                   [[r["month"], r["category"], r["amount"], r["note"]] for r in rows])


async def export_bundle_csv(db, kind: str) -> str:
    """指定バンドル（サブスク/通信費）を 年月,名前,金額 のCSV文字列で返す。"""
    rows = await db.all(
        "SELECT month, name, amount FROM bundle_items WHERE kind = ? ORDER BY month, id", (kind,)
    )
    return _to_csv(["年月", "名前", "金額"],
                   [[r["month"], r["name"], r["amount"]] for r in rows])
