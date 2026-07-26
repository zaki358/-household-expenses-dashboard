"""CSV取込（ブラウザアップロード／PC移行の共通ロジック）。

バイト列を受け取り、utf-8-sig→cp932 の順にデコードし、年月/カテゴリ/金額 を
検証・正規化する。dry-run では「変更前→変更後」の提案とスキップ理由を返し、
commit で entries(source='import') に投入する。
"""

import csv
import io
from datetime import date

from src.repo import category_to_group

REQUIRED_COLUMNS = ["年月", "カテゴリ", "金額"]
ENCODINGS = ["utf-8-sig", "cp932"]


def decode_csv(raw: bytes) -> str:
    """utf-8-sig → cp932 の順にデコードする。"""
    for enc in ENCODINGS:
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("文字コードを判定できません（utf-8-sig / cp932）")


def parse_amount(text: str) -> int | None:
    """カンマ・円記号を除いて整数化する。不正なら None。"""
    cleaned = str(text).replace(",", "").replace("¥", "").strip()
    if not cleaned:
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def analyze_entries_csv(raw: bytes, config: dict, today: date | None = None) -> dict:
    """取込CSVを解析し、投入予定（proposals）とスキップ（skipped）を返す。

    返り値:
      {"ok": bool, "error": str|None,
       "proposals": [{行, 変更前年月, 年月, カテゴリ, 金額}],
       "skipped": [{行, 理由}],
       "unknown_categories": [str]}
    """
    from src.dates import normalize_month

    text = decode_csv(raw)
    reader = csv.DictReader(io.StringIO(text))
    fields = [(f or "").strip() for f in (reader.fieldnames or [])]
    missing = [c for c in REQUIRED_COLUMNS if c not in fields]
    if missing:
        return {"ok": False, "error": f"必要な列がありません: {', '.join(missing)}",
                "proposals": [], "skipped": [], "unknown_categories": []}

    mapping = category_to_group(config)
    proposals: list[dict] = []
    skipped: list[dict] = []
    unknown: set[str] = set()

    for line_no, raw_row in enumerate(reader, start=2):  # ヘッダが1行目
        row = {(k or "").strip(): (v or "").strip() for k, v in raw_row.items()}
        category = row.get("カテゴリ", "")
        amount = parse_amount(row.get("金額", ""))
        before = row.get("年月", "")

        if not category:
            skipped.append({"行": line_no, "理由": "カテゴリが空です"})
            continue
        if amount is None or amount <= 0:
            skipped.append({"行": line_no, "理由": f"金額が不正です: {row.get('金額', '')!r}"})
            continue
        try:
            after = normalize_month(before, today)
        except Exception:
            skipped.append({"行": line_no, "理由": f"年月「{before}」を解釈できません"})
            continue
        if category not in mapping:
            unknown.add(category)
        proposals.append({"行": line_no, "変更前年月": before or "（空欄）",
                          "年月": after, "カテゴリ": category, "金額": amount})

    return {"ok": True, "error": None, "proposals": proposals,
            "skipped": skipped, "unknown_categories": sorted(unknown)}


async def commit_entries(db, proposals: list[dict]) -> int:
    """proposals を entries(source='import') に投入し、件数を返す。"""
    statements = [
        ("INSERT INTO entries (month, category, amount, source) VALUES (?, ?, ?, 'import')",
         (p["年月"], p["カテゴリ"], p["金額"]))
        for p in proposals
    ]
    if statements:
        await db.batch(statements)
    return len(statements)
