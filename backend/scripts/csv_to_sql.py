"""data/*.csv を新しい D1 スキーマ（entries / bundle_items）へ取り込む移行スクリプト。

- dashboard_input.csv      → entries(source='manual')
- その他の月次 CSV          → entries(source='import')
- dashboard_subscriptions.csv → bundle_items(kind='subscriptions')
- dashboard_communications.csv → bundle_items(kind='communications')

使い方:
    python scripts/csv_to_sql.py [--data DIR] [--db PATH] [--reset]

DB を指定しなければ backend/local.db を作成/更新する。--reset で既存の
entries / bundle_items を空にしてから取り込む（冪等な再実行用）。
"""

import argparse
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from src.bundle_store import ALL_BUNDLES  # noqa: E402
from src.dates import normalize_month  # noqa: E402
from src.db import SqliteDatabase  # noqa: E402

REQUIRED_ENTRY_COLS = ["年月", "カテゴリ", "金額"]
REQUIRED_BUNDLE_COLS = ["年月", "名前", "金額"]
ENCODINGS = ["utf-8-sig", "cp932"]
ENTRIES_FILE = "dashboard_input.csv"
_BUNDLE_BY_FILENAME = {spec.filename: spec for spec in ALL_BUNDLES}


def _decode(raw: bytes) -> str:
    for enc in ENCODINGS:
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("文字コードを判定できません（utf-8-sig / cp932）")


def _rows(text: str) -> list[dict]:
    import csv
    import io
    reader = csv.DictReader(io.StringIO(text))
    reader.fieldnames = [(f or "").strip() for f in (reader.fieldnames or [])]
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]


def _parse_amount(text: str) -> int | None:
    cleaned = str(text).replace(",", "").replace("¥", "").strip()
    if not cleaned:
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def _read(path: Path) -> list[dict]:
    return _rows(_decode(path.read_bytes()))


async def _import(data_dir: Path, db_path: Path, reset: bool) -> None:
    db = SqliteDatabase(db_path)
    if reset:
        await db.run("DELETE FROM entries", ())
        await db.run("DELETE FROM bundle_items", ())

    csv_files = sorted(data_dir.glob("*.csv"))
    bundle_names = set(_BUNDLE_BY_FILENAME)

    entry_stmts: list[tuple[str, tuple]] = []
    # まず手入力（dashboard_input.csv）→ id が先頭に来るように
    ordered = [p for p in csv_files if p.name == ENTRIES_FILE] + \
              [p for p in csv_files if p.name != ENTRIES_FILE and p.name not in bundle_names]
    entries_total = 0
    for path in ordered:
        source = "manual" if path.name == ENTRIES_FILE else "import"
        for row in _read(path):
            if any(c not in row for c in REQUIRED_ENTRY_COLS):
                continue
            amount = _parse_amount(row["金額"])
            category = row["カテゴリ"].strip()
            if amount is None or amount <= 0 or not category:
                continue
            month = normalize_month(row["年月"])
            entry_stmts.append((
                "INSERT INTO entries (month, category, amount, source) VALUES (?, ?, ?, ?)",
                (month, category, amount, source),
            ))
            entries_total += 1
    await db.batch(entry_stmts)

    bundle_total = 0
    bundle_stmts: list[tuple[str, tuple]] = []
    for filename, spec in _BUNDLE_BY_FILENAME.items():
        path = data_dir / filename
        if not path.exists():
            continue
        for row in _read(path):
            if any(c not in row for c in REQUIRED_BUNDLE_COLS):
                continue
            amount = _parse_amount(row["金額"])
            name = row["名前"].strip()
            if amount is None or amount <= 0 or not name:
                continue
            month = normalize_month(row["年月"])
            bundle_stmts.append((
                "INSERT INTO bundle_items (kind, month, name, amount) VALUES (?, ?, ?, ?)",
                (spec.key, month, name, amount),
            ))
            bundle_total += 1
    await db.batch(bundle_stmts)

    print(f"imported {entries_total} entries, {bundle_total} bundle items -> {db_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=BACKEND_DIR / "data")
    parser.add_argument("--db", type=Path, default=BACKEND_DIR / "local.db")
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    asyncio.run(_import(args.data, args.db, args.reset))


if __name__ == "__main__":
    main()
