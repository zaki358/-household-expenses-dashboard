"""ダッシュボードから入力した収入・固定費・投資データの管理。

Googleスプレッドシート由来の CSV は保全し、ダッシュボードでの手入力は
専用ファイル data/dashboard_input.csv に保存する。スキーマは他の CSV と
同じ（年月・カテゴリ・金額）なので、loader が自動で読み込んで集計に反映する。
"""

from pathlib import Path

import pandas as pd

from src.config import PROJECT_ROOT, category_to_group
from src.loader import REQUIRED_COLUMNS, _normalize_month

ENTRIES_FILENAME = "dashboard_input.csv"
DATA_DIR = PROJECT_ROOT / "data"


def entries_path(data_dir: Path = DATA_DIR) -> Path:
    """ダッシュボード入力用 CSV のパスを返す。"""
    return data_dir / ENTRIES_FILENAME


def load_entries(data_dir: Path = DATA_DIR) -> list[dict]:
    """専用 CSV の行を {年月, カテゴリ, 金額} のリスト（保存順）で返す。"""
    path = entries_path(data_dir)
    if not path.exists() or path.stat().st_size == 0:
        return []
    df = pd.read_csv(path, encoding="utf-8-sig", dtype=str).fillna("")
    entries = []
    for _, row in df.iterrows():
        amount_text = str(row.get("金額", "")).replace(",", "").strip()
        if not amount_text:
            continue
        entries.append({
            "年月": str(row.get("年月", "")).strip(),
            "カテゴリ": str(row.get("カテゴリ", "")).strip(),
            "金額": int(float(amount_text)),
        })
    return entries


def add_entry(config: dict, entries: list[dict], month: object,
              category: object, amount: object) -> list[dict]:
    """検証済みのエントリを追加した新しいリストを返す（元のリストは変更しない）。"""
    try:
        normalized_month = _normalize_month(month)
    except Exception:
        raise ValueError("年月の形式が不正です（例: 2026-06）")

    cat = str(category).strip()
    if cat not in category_to_group(config):
        raise ValueError(f"カテゴリ「{cat}」は登録されていません")

    try:
        amount_int = int(amount)
    except (TypeError, ValueError):
        raise ValueError("金額は数値で入力してください")
    if amount_int <= 0:
        raise ValueError("金額は1以上で入力してください")

    new_entry = {"年月": normalized_month, "カテゴリ": cat, "金額": amount_int}
    return entries + [new_entry]


def update_entry(entries: list[dict], index: int, amount: object) -> list[dict]:
    """指定インデックスのエントリの金額を更新した新しいリストを返す。"""
    try:
        amount_int = int(amount)
    except (TypeError, ValueError):
        raise ValueError("金額は数値で入力してください")
    if amount_int <= 0:
        raise ValueError("金額は1以上で入力してください")
    return [
        {**e, "金額": amount_int} if i == index else dict(e)
        for i, e in enumerate(entries)
    ]


def remove_entry(entries: list[dict], index: int) -> list[dict]:
    """指定インデックスのエントリを削除した新しいリストを返す（元は変更しない）。"""
    return [e for i, e in enumerate(entries) if i != index]


def entries_for_group(entries: list[dict], config: dict, month: str,
                      group: str) -> list[tuple[int, dict]]:
    """指定月・指定グループのエントリを (元インデックス, エントリ) の組で返す。"""
    mapping = category_to_group(config)
    return [
        (i, e) for i, e in enumerate(entries)
        if e["年月"] == month and mapping.get(e["カテゴリ"]) == group
    ]


def save_entries(entries: list[dict], data_dir: Path = DATA_DIR) -> None:
    """エントリ一覧を専用 CSV に保存する。"""
    path = entries_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(entries, columns=REQUIRED_COLUMNS)
    df.to_csv(path, index=False, encoding="utf-8-sig")
