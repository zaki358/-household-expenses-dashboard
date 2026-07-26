"""月（ダッシュボード）の作成と引き継ぎ。

「翌月を作成」すると、先月の固定費（ダッシュボード入力分）とサブスクを
引き継いだ新しい月を用意する。収入・投資は毎月入力するため引き継がない。
作成した月は config["dashboard_months"] に登録し、データが空でも
サイドバーに表示されるようにする。
"""

from pathlib import Path

import pandas as pd

from src.bundle_store import ALL_BUNDLES, DATA_DIR, carry_over, load_items, save_items
from src.config import category_to_group
from src.entries import load_entries, save_entries

REGISTRY_KEY = "dashboard_months"


def next_month(month: str) -> str:
    """「2026-06」→「2026-07」のように翌月を返す。"""
    return str(pd.Period(str(month).strip(), freq="M") + 1)


def registered_months(config: dict) -> list[str]:
    """config に登録済みの月一覧を返す。"""
    return list(config.get(REGISTRY_KEY, []))


def carry_over_fixed_costs(entries: list[dict], config: dict,
                           from_month: str, to_month: str) -> list[dict]:
    """from_month の固定費入力を to_month へ複製した新しいリストを返す。

    to_month にすでに固定費がある場合は二重登録を避けてそのまま返す。
    """
    mapping = category_to_group(config)
    if any(e["年月"] == to_month and mapping.get(e["カテゴリ"]) == "固定費"
           for e in entries):
        return list(entries)
    carried = [
        {"年月": to_month, "カテゴリ": e["カテゴリ"], "金額": e["金額"]}
        for e in entries
        if e["年月"] == from_month and mapping.get(e["カテゴリ"]) == "固定費"
    ]
    return entries + carried


def create_next_month(config: dict, existing_months: list[str],
                      data_dir: Path = DATA_DIR) -> tuple[dict, str]:
    """翌月を作成し、(新しい config, 作成した月) を返す。

    先月の固定費・サブスクを引き継いで CSV に保存し、作成した月を
    config["dashboard_months"] に登録した新しい config を返す。
    """
    months = sorted(set(existing_months) | set(registered_months(config)))
    if not months:
        raise ValueError("基準となる月がありません。先に当月のデータを入力してください。")

    base = months[-1]
    target = next_month(base)

    entries = load_entries(data_dir)
    carried_entries = carry_over_fixed_costs(entries, config, base, target)
    if carried_entries != entries:
        save_entries(carried_entries, data_dir)

    # サブスク・通信費は月ごとバンドルとして先月分を引き継ぐ
    for spec in ALL_BUNDLES:
        items = load_items(spec, data_dir)
        carried = carry_over(items, base, target)
        if carried != items:
            save_items(spec, carried, data_dir)

    registry = sorted(set(registered_months(config)) | {target})
    new_config = {**config, REGISTRY_KEY: registry}
    return new_config, target
