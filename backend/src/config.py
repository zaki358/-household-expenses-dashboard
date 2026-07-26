"""設定ファイル (config.yaml) の読み書き。"""

from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "config.yaml"

DEFAULT_CONFIG = {
    "wedding_fund": {"target_amount": 3000000, "source": "savings"},
    "investment_as_expense": True,
    "categories": {
        "収入": ["夫給与", "妻給与", "ボーナス", "その他収入"],
        "固定費": ["家賃", "保険", "サブスク"],
        "インフラ": ["電気", "ガス", "水道"],
        "通信費": ["通信費"],
        "変動費": ["食費", "消耗品", "交際費", "娯楽費"],
        "車": ["ガソリン(車)", "車保険", "車税金", "車検", "車整備"],
        "バイク": ["ガソリン(バイク)", "バイク保険", "バイク税金", "バイク整備"],
        "投資": ["NISA", "投資信託", "株式", "その他投資"],
    },
    "income_owner": {"夫給与": "夫", "妻給与": "妻"},
    # ダッシュボードで作成済みの月（データが空でもサイドバーに表示する）
    "dashboard_months": [],
}


def load_config(path: Path = CONFIG_PATH) -> dict:
    """config.yaml を読み込む。存在しなければデフォルトを返す。"""
    if not path.exists():
        return dict(DEFAULT_CONFIG)
    with open(path, encoding="utf-8") as f:
        loaded = yaml.safe_load(f)
    if not isinstance(loaded, dict):
        raise ValueError(f"設定ファイルの形式が不正です: {path}")
    # 欠けているキーはデフォルトで補完した新しい dict を返す
    return {**DEFAULT_CONFIG, **loaded}


def save_config(config: dict, path: Path = CONFIG_PATH) -> None:
    """設定を config.yaml に保存する。"""
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(config, f, allow_unicode=True, sort_keys=False)


def category_to_group(config: dict) -> dict:
    """カテゴリ名 → グループ名 の対応表を作る。"""
    mapping = {}
    for group, categories in config["categories"].items():
        for cat in categories:
            mapping[cat] = group
    return mapping


def add_category(config: dict, group: str, name: str) -> dict:
    """カテゴリを追加した新しい設定 dict を返す（元の dict は変更しない）。"""
    name = name.strip()
    if not name:
        raise ValueError("カテゴリ名が空です")
    if group not in config["categories"]:
        raise ValueError(f"不明なグループです: {group}")
    if name in category_to_group(config):
        raise ValueError(f"カテゴリ「{name}」はすでに存在します")
    new_categories = {
        g: (cats + [name] if g == group else list(cats))
        for g, cats in config["categories"].items()
    }
    return {**config, "categories": new_categories}


GOAL_SOURCES = ("savings", "net_worth")
GOAL_DEFAULT_SOURCE = "savings"


def get_goals(config: dict) -> list[dict]:
    """登録済みの目標一覧（コピー）を返す。

    新形式 `goals` キーが無く旧 `wedding_fund` がある場合のみ、
    「結婚資金」目標として後方互換的に読み替える。
    `goals` キーが存在すれば、空リストでもそれを正とする
    （= 全目標を削除した状態を尊重し、wedding_fund に復帰させない）。
    """
    if "goals" in config:
        return [dict(g) for g in (config["goals"] or [])]
    fund = config.get("wedding_fund")
    if fund:
        return [{
            "name": "結婚資金",
            "target_amount": int(fund.get("target_amount", 0)),
            "source": fund.get("source", GOAL_DEFAULT_SOURCE),
        }]
    return []


def get_active_goal(config: dict) -> dict | None:
    """タブに表示する目標を返す。未指定なら先頭。目標が無ければ None。"""
    goals = get_goals(config)
    if not goals:
        return None
    name = config.get("active_goal")
    for goal in goals:
        if goal["name"] == name:
            return goal
    return goals[0]


def _with_goals(config: dict, goals: list[dict], active: str | None = None) -> dict:
    """goals を正規化して反映した新しい設定 dict を返す（wedding_fund は除去）。"""
    new = {k: v for k, v in config.items() if k != "wedding_fund"}
    new["goals"] = goals
    names = [g["name"] for g in goals]
    chosen = active if active is not None else new.get("active_goal")
    new["active_goal"] = chosen if chosen in names else (names[0] if names else None)
    return new


def add_goal(config: dict, name: str, target_amount: object,
             source: str = GOAL_DEFAULT_SOURCE) -> dict:
    """目標を追加した新しい設定 dict を返す（元の dict は変更しない）。"""
    name = str(name).strip()
    if not name:
        raise ValueError("目標名が空です")
    try:
        target = int(target_amount)
    except (TypeError, ValueError):
        raise ValueError("目標額は数値で入力してください")
    if target <= 0:
        raise ValueError("目標額は1以上で入力してください")
    if source not in GOAL_SOURCES:
        raise ValueError(f"不明な算出元です: {source}")
    goals = get_goals(config)
    if any(g["name"] == name for g in goals):
        raise ValueError(f"目標「{name}」はすでに存在します")
    goals = goals + [{"name": name, "target_amount": target, "source": source}]
    return _with_goals(config, goals)


def remove_goal(config: dict, name: str) -> dict:
    """指定目標を削除した新しい設定 dict を返す（元の dict は変更しない）。"""
    goals = [g for g in get_goals(config) if g["name"] != name]
    return _with_goals(config, goals)


def set_active_goal(config: dict, name: str) -> dict:
    """表示する目標を切り替えた新しい設定 dict を返す。"""
    goals = get_goals(config)
    if not any(g["name"] == name for g in goals):
        raise ValueError(f"目標「{name}」が存在しません")
    return _with_goals(config, goals, active=name)
