"""data/ フォルダの CSV 読み込み・検証・バックアップ。"""

import shutil
from datetime import date
from pathlib import Path

import pandas as pd

from src.bundle_store import (
    ALL_BUNDLES,
    bundle_filenames,
    injected_rows,
    load_items,
    months_with_items,
)
from src.config import PROJECT_ROOT, category_to_group

DATA_DIR = PROJECT_ROOT / "data"
BACKUP_DIR = PROJECT_ROOT / "backup"

REQUIRED_COLUMNS = ["年月", "カテゴリ", "金額"]
ENCODINGS = ["utf-8-sig", "cp932"]


def find_csv_files(data_dir: Path = DATA_DIR) -> list[Path]:
    """data/ 内の CSV ファイル一覧を返す。"""
    if not data_dir.exists():
        return []
    return sorted(data_dir.glob("*.csv"))


def _read_csv(path: Path) -> pd.DataFrame:
    """エンコーディングを試行しながら CSV を読む。"""
    last_error: Exception | None = None
    for enc in ENCODINGS:
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError as e:
            last_error = e
    raise ValueError(f"{path.name} の文字コードを判定できません: {last_error}")


def _is_blank(value) -> bool:
    """空欄（空文字・空白のみ・NaN）かどうかを判定する。"""
    return str(value).strip().lower() in ("", "nan")


def _normalize_month(value, today: date | None = None) -> str:
    """年月を YYYY-MM に正規化する。

    対応する入力:
    - 「2026-01」「2026/1」「2026年1月」など → そのまま正規化
    - 数字単体「6」「06」（1〜12） → 実行時点の年の同月（例: 2026-06）
    - 空欄（空文字・NaN） → 実行時点の年月
    """
    today = today or date.today()
    text = str(value).strip()
    if _is_blank(text):
        return f"{today.year:04d}-{today.month:02d}"
    if text.isdigit() and 1 <= int(text) <= 12:
        return f"{today.year:04d}-{int(text):02d}"
    normalized = text.replace("年", "-").replace("月", "").replace("/", "-")
    period = pd.Period(normalized, freq="M")
    return str(period)


def month_fix_proposals(df: pd.DataFrame, today: date | None = None) -> list[dict]:
    """年月列の「変更前 → 変更後」修正提案を返す（会計の一括クリーンアップ用）。

    値が変化する行だけを返す。解釈できない年月は提案に含めない。
    返り値: [{"index": 0始まり行番号, "変更前": str, "変更後": str}, ...]
    """
    today = today or date.today()
    proposals: list[dict] = []
    if "年月" not in df.columns:
        return proposals
    for idx, value in df["年月"].items():
        before = "（空欄）" if _is_blank(value) else str(value).strip()
        try:
            after = _normalize_month(value, today)
        except Exception:
            continue
        if before != after:
            proposals.append({"index": int(idx), "変更前": before, "変更後": after})
    return proposals


def load_data(config: dict, data_dir: Path = DATA_DIR,
              today: date | None = None) -> tuple[pd.DataFrame, list[str]]:
    """全 CSV と月ごとバンドル（サブスク・通信費）を読み込んで結合・検証する。"""
    today = today or date.today()
    warnings: list[str] = []
    empty = pd.DataFrame(columns=[*REQUIRED_COLUMNS, "グループ"])

    # 月ごとバンドル用の CSV は別管理なので家計データの読み込み対象から除外する
    excluded = set(bundle_filenames())
    files = [f for f in find_csv_files(data_dir) if f.name not in excluded]
    bundles = [(spec, load_items(spec, data_dir)) for spec in ALL_BUNDLES]

    frames = []
    for path in files:
        df = _read_csv(path)
        df.columns = [str(c).strip() for c in df.columns]
        missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
        if missing:
            warnings.append(f"{path.name}: 列が不足しています {missing} → スキップしました")
            continue
        frames.append(df[REQUIRED_COLUMNS])

    if not frames:
        # CSV は無くても、月ごとバンドルがあれば注入して返す
        return inject_bundles(empty, bundles).sort_values("年月").reset_index(drop=True), warnings

    # 年月は空でも当月補完するので、カテゴリ・金額が無い行だけ除外する
    raw = pd.concat(frames, ignore_index=True).dropna(subset=["カテゴリ", "金額"])

    # 年月の正規化（数字単体→当年同月、空欄→当月、不正な行は除外して警告）
    months = []
    valid_rows = []
    filled_blank = 0
    for idx, value in raw["年月"].items():
        blank = _is_blank(value)
        try:
            months.append(_normalize_month(value, today))
            valid_rows.append(idx)
            if blank:
                filled_blank += 1
        except Exception:
            warnings.append(f"年月「{value}」を解釈できない行をスキップしました")
    data = raw.loc[valid_rows].assign(年月=months)
    if filled_blank:
        current = f"{today.year:04d}-{today.month:02d}"
        warnings.append(
            f"年月が空欄の {filled_blank} 行を当月（{current}）で補完しました"
            "（過去データの取り込み時はご確認ください）"
        )

    # 金額の数値化（カンマ・円記号を除去）
    amounts = pd.to_numeric(
        data["金額"].astype(str).str.replace(",", "").str.replace("¥", "").str.strip(),
        errors="coerce",
    )
    bad_amount = amounts.isna()
    if bad_amount.any():
        warnings.append(f"金額を数値にできない行を {int(bad_amount.sum())} 件スキップしました")
    data = data.loc[~bad_amount].assign(金額=amounts.loc[~bad_amount])

    # カテゴリ → グループのマッピング
    mapping = category_to_group(config)
    data = data.assign(カテゴリ=data["カテゴリ"].astype(str).str.strip())
    groups = data["カテゴリ"].map(mapping)
    unknown = sorted(data.loc[groups.isna(), "カテゴリ"].unique())
    if unknown:
        warnings.append(
            f"未登録カテゴリを「未分類」として支出扱いにしました: {', '.join(unknown)}"
            "（設定画面から追加できます）"
        )
    data = data.assign(グループ=groups.fillna("未分類"))

    # CSV の集約カテゴリ行と月ごとバンドル管理が二重計上にならないかチェック
    for spec, items in bundles:
        if not items:
            continue
        csv_label_months = set(data.loc[data["カテゴリ"] == spec.label, "年月"])
        if set(months_with_items(items)) & csv_label_months:
            warnings.append(
                f"CSVに「{spec.label}」行があり、{spec.noun}管理と二重計上になる月があります。"
                f"CSVの「{spec.label}」行を削除してください。"
            )

    data = inject_bundles(data, bundles)
    return data.sort_values("年月").reset_index(drop=True), warnings


def inject_bundles(data: pd.DataFrame, bundles: list[tuple]) -> pd.DataFrame:
    """月ごとバンドルを、各月の集約カテゴリ1行（合計額）として注入する。"""
    rows: list[dict] = []
    for spec, items in bundles:
        rows.extend(injected_rows(spec, items))
    if not rows:
        return data
    combined = pd.concat([data, pd.DataFrame(rows)], ignore_index=True)
    return combined.sort_values("年月").reset_index(drop=True)


def backup_csv_files(data_dir: Path = DATA_DIR, backup_dir: Path = BACKUP_DIR) -> Path | None:
    """data/ の CSV を backup/YYYY-MM-DD/ にコピーする（1日1回）。"""
    files = find_csv_files(data_dir)
    if not files:
        return None
    today_dir = backup_dir / date.today().isoformat()
    if today_dir.exists():
        return today_dir  # 本日分はバックアップ済み
    today_dir.mkdir(parents=True)
    for path in files:
        shutil.copy2(path, today_dir / path.name)
    return today_dir
