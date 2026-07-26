"""月ごとの「項目別入力・合算表示」バンドル（サブスク・通信費）。

サブスクと通信費はどちらも「複数の名前付き項目を月ごとに入力し、集計時は
1カテゴリにまとめる」点で挙動が同じなので、共通のストアで扱う。

- 保存: data/<spec.filename>（カラム: 年月, 名前, 金額）
- 集計: 各月の合計を spec.label カテゴリ（spec.group グループ）1行として注入
- 翌月作成時は先月分を引き継ぐ（金額が変わった月だけ編集）
"""

from dataclasses import dataclass
from pathlib import Path

# BundleSpec / ALL_BUNDLES はランタイム（Workers）でも使うため、pandas は
# CSV 入出力（load_items/save_items = ローカル専用の旧経路）でだけ遅延 import する。

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
COLUMNS = ["年月", "名前", "金額"]


@dataclass(frozen=True)
class BundleSpec:
    """バンドルの種類ごとの設定。"""
    key: str          # 内部識別子
    filename: str     # 保存先 CSV
    label: str        # 集計時にまとめるカテゴリ名
    group: str        # 集計グループ
    noun: str         # UI 表示名
    example: str      # 入力欄のプレースホルダ例


SUBSCRIPTIONS = BundleSpec(
    key="subscriptions",
    filename="dashboard_subscriptions.csv",
    label="サブスク",
    group="固定費",
    noun="サブスク",
    example="Spotify",
)
COMMUNICATIONS = BundleSpec(
    key="communications",

    filename="dashboard_communications.csv",
    label="通信費",
    group="通信費",
    noun="通信費",
    example="自分のスマホ",
)
ALL_BUNDLES = [SUBSCRIPTIONS, COMMUNICATIONS]


def bundle_filenames() -> list[str]:
    """全バンドルの CSV ファイル名（家計データ読み込みから除外する用）。"""
    return [spec.filename for spec in ALL_BUNDLES]


def bundle_path(spec: BundleSpec, data_dir: Path = DATA_DIR) -> Path:
    """バンドル CSV のパスを返す。"""
    return data_dir / spec.filename


def load_items(spec: BundleSpec, data_dir: Path = DATA_DIR) -> list[dict]:
    """バンドルの行を {年月, 名前, 金額} のリスト（保存順）で返す。"""
    import pandas as pd  # ローカル専用の旧 CSV 経路でのみ使う

    path = bundle_path(spec, data_dir)
    if not path.exists() or path.stat().st_size == 0:
        return []
    df = pd.read_csv(path, encoding="utf-8-sig", dtype=str).fillna("")
    items = []
    for _, row in df.iterrows():
        amount_text = str(row.get("金額", "")).replace(",", "").strip()
        name = str(row.get("名前", "")).strip()
        if not name or not amount_text:
            continue
        items.append({
            "年月": str(row.get("年月", "")).strip(),
            "名前": name,
            "金額": int(float(amount_text)),
        })
    return items


def save_items(spec: BundleSpec, items: list[dict], data_dir: Path = DATA_DIR) -> None:
    """バンドル一覧を CSV に保存する。"""
    import pandas as pd  # ローカル専用の旧 CSV 経路でのみ使う

    path = bundle_path(spec, data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(items, columns=COLUMNS)
    df.to_csv(path, index=False, encoding="utf-8-sig")


def items_for_month(items: list[dict], month: str) -> list[tuple[int, dict]]:
    """指定月の項目を (元インデックス, 項目) の組で返す。"""
    return [(i, s) for i, s in enumerate(items) if s["年月"] == month]


def month_total(items: list[dict], month: str) -> int:
    """指定月の合計額を返す。"""
    return sum(s["金額"] for s in items if s["年月"] == month)


def months_with_items(items: list[dict]) -> list[str]:
    """項目が1件以上ある月の一覧（昇順）。"""
    return sorted({s["年月"] for s in items})


def add_item(items: list[dict], month: str, name: object,
             amount: object) -> list[dict]:
    """項目を追加した新しいリストを返す（元のリストは変更しない）。"""
    clean_name = str(name).strip()
    if not clean_name:
        raise ValueError("名前が空です")
    try:
        amount_int = int(amount)
    except (TypeError, ValueError):
        raise ValueError("金額は数値で入力してください")
    if amount_int <= 0:
        raise ValueError("金額は1以上で入力してください")
    if any(s["年月"] == month and s["名前"] == clean_name for s in items):
        raise ValueError(f"「{clean_name}」は{month}にすでに登録されています")
    return items + [{"年月": str(month).strip(), "名前": clean_name, "金額": amount_int}]


def update_amount(items: list[dict], index: int, amount: object) -> list[dict]:
    """指定インデックスの金額を更新した新しいリストを返す。"""
    try:
        amount_int = int(amount)
    except (TypeError, ValueError):
        raise ValueError("金額は数値で入力してください")
    if amount_int <= 0:
        raise ValueError("金額は1以上で入力してください")
    return [
        {**s, "金額": amount_int} if i == index else dict(s)
        for i, s in enumerate(items)
    ]


def remove_item(items: list[dict], index: int) -> list[dict]:
    """指定インデックスの項目を削除した新しいリストを返す。"""
    return [s for i, s in enumerate(items) if i != index]


def carry_over(items: list[dict], from_month: str, to_month: str) -> list[dict]:
    """from_month の項目を to_month へ複製した新しいリストを返す。

    to_month にすでに項目がある場合は二重登録を避けてそのまま返す。
    """
    if any(s["年月"] == to_month for s in items):
        return list(items)
    carried = [
        {"年月": to_month, "名前": s["名前"], "金額": s["金額"]}
        for s in items if s["年月"] == from_month
    ]
    return items + carried


def injected_rows(spec: BundleSpec, items: list[dict]) -> list[dict]:
    """各月の合計を spec.label カテゴリ1行にまとめた注入用の行リストを返す。"""
    rows = []
    for month in months_with_items(items):
        total = month_total(items, month)
        if total <= 0:
            continue
        rows.append({
            "年月": month,
            "カテゴリ": spec.label,
            "金額": total,
            "グループ": spec.group,
        })
    return rows
