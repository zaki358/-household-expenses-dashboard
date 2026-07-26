"""全 SQL アクセスを集約するリポジトリ層。

上位（ルーター・集計）は Database Protocol とこのモジュールにだけ依存する。
load_config は旧 config.yaml と同じ形の dict を返すため、config.py の純関数
（category_to_group / get_goals 等）や aggregate/goal はそのまま使える。
"""

from src.bundle_store import ALL_BUNDLES
from src.dates import next_month, normalize_month

_SPECS = {spec.key: spec for spec in ALL_BUNDLES}
FIXED_COST_GROUP = "固定費"


def category_to_group(config: dict) -> dict:
    """カテゴリ名 → グループ名 の対応表を作る（config.yaml 非依存の純関数）。"""
    mapping: dict[str, str] = {}
    for group, categories in config["categories"].items():
        for cat in categories:
            mapping[cat] = group
    return mapping


def spec_for(kind: str):
    """kind から BundleSpec を返す（未知なら KeyError）。"""
    return _SPECS[kind]


# --------------------------------------------------------------------------- #
# config（旧 config.yaml 相当）
# --------------------------------------------------------------------------- #
async def load_config(db) -> dict:
    """DB からアプリ設定を組み立てて返す（旧 load_config と同形）。"""
    groups = await db.all("SELECT name FROM category_groups ORDER BY sort_order, name")
    cats = await db.all(
        "SELECT name, group_name, income_owner FROM categories ORDER BY sort_order, name"
    )
    categories: dict[str, list[str]] = {g["name"]: [] for g in groups}
    income_owner: dict[str, str] = {}
    for c in cats:
        categories.setdefault(c["group_name"], []).append(c["name"])
        if c["income_owner"]:
            income_owner[c["name"]] = c["income_owner"]

    settings = {s["key"]: s["value"] for s in await db.all("SELECT key, value FROM app_settings")}
    raw_invest = settings.get("investment_as_expense")
    invest = True if raw_invest is None else str(raw_invest).lower() == "true"

    goals = [
        {"name": g["name"], "target_amount": g["target_amount"], "source": g["source"]}
        for g in await db.all("SELECT name, target_amount, source FROM goals ORDER BY sort_order, name")
    ]
    months = [r["month"] for r in await db.all("SELECT month FROM dashboard_months ORDER BY month")]

    return {
        "categories": categories,
        "income_owner": income_owner,
        "investment_as_expense": invest,
        "goals": goals,
        "active_goal": settings.get("active_goal"),
        "dashboard_months": months,
    }


# --------------------------------------------------------------------------- #
# 集計用データセット（旧 load_data 相当）
# --------------------------------------------------------------------------- #
async def load_dataset(db, config: dict | None = None) -> tuple[list[dict], list[str]]:
    """entries とバンドル月次合計を結合した {年月,カテゴリ,金額(float),グループ} を返す。"""
    if config is None:
        config = await load_config(db)
    mapping = category_to_group(config)
    warnings: list[str] = []
    rows: list[dict] = []
    unknown: set[str] = set()

    for e in await db.all("SELECT month, category, amount FROM entries ORDER BY id"):
        group = mapping.get(e["category"])
        if group is None:
            unknown.add(e["category"])
            group = "未分類"
        rows.append({"年月": e["month"], "カテゴリ": e["category"],
                     "金額": float(e["amount"]), "グループ": group})

    for spec in ALL_BUNDLES:
        monthly = await db.all(
            "SELECT month, SUM(amount) AS total FROM bundle_items WHERE kind = ? GROUP BY month",
            (spec.key,),
        )
        for row in monthly:
            total = row["total"]
            if not total or total <= 0:
                continue
            rows.append({"年月": row["month"], "カテゴリ": spec.label,
                         "金額": float(total), "グループ": spec.group})

    if unknown:
        warnings.append(
            f"未登録カテゴリを「未分類」として支出扱いにしました: {', '.join(sorted(unknown))}"
            "（設定画面から追加できます）"
        )
    return rows, warnings


async def all_months(db) -> list[str]:
    """データのある月 ∪ 作成済みの月（昇順）。"""
    rows = await db.all(
        "SELECT month FROM entries "
        "UNION SELECT month FROM bundle_items "
        "UNION SELECT month FROM dashboard_months"
    )
    return sorted(r["month"] for r in rows)


# --------------------------------------------------------------------------- #
# entries CRUD
# --------------------------------------------------------------------------- #
def _validate_amount(amount) -> int:
    try:
        value = int(amount)
    except (TypeError, ValueError):
        raise ValueError("金額は数値で入力してください")
    if value <= 0:
        raise ValueError("金額は1以上で入力してください")
    return value


async def list_entries(db, month: str | None = None, group: str | None = None,
                       config: dict | None = None) -> list[dict]:
    """手入力(source='manual')の entries を {id,年月,カテゴリ,金額(int)} 保存順で返す。

    取込(import)分（スプレッドシート由来の月次CSV）は集計には使うが、
    このエンドポイントでは編集対象にしない（旧 dashboard_input.csv と同じ挙動）。
    """
    rows = await db.all(
        "SELECT id, month AS 年月, category AS カテゴリ, amount AS 金額 FROM entries "
        "WHERE source = 'manual' ORDER BY id"
    )
    if month is not None:
        rows = [r for r in rows if r["年月"] == month]
    if group is not None:
        mapping = category_to_group(config or await load_config(db))
        rows = [r for r in rows if mapping.get(r["カテゴリ"]) == group]
    return rows


async def entry_exists(db, entry_id: int) -> bool:
    rows = await db.all("SELECT 1 FROM entries WHERE id = ? AND source = 'manual'", (entry_id,))
    return bool(rows)


async def add_entry(db, config: dict, month, category, amount) -> list[dict]:
    """検証してから entries に1行追加し、更新後の全件を返す。"""
    try:
        normalized_month = normalize_month(month)
    except Exception:
        raise ValueError("年月の形式が不正です（例: 2026-06）")
    cat = str(category).strip()
    if cat not in category_to_group(config):
        raise ValueError(f"カテゴリ「{cat}」は登録されていません")
    value = _validate_amount(amount)
    await db.run(
        "INSERT INTO entries (month, category, amount, source) VALUES (?, ?, ?, 'manual')",
        (normalized_month, cat, value),
    )
    return await list_entries(db)


async def update_entry_amount(db, entry_id: int, amount) -> list[dict]:
    value = _validate_amount(amount)
    await db.run("UPDATE entries SET amount = ? WHERE id = ? AND source = 'manual'", (value, entry_id))
    return await list_entries(db)


async def delete_entry(db, entry_id: int) -> list[dict]:
    await db.run("DELETE FROM entries WHERE id = ? AND source = 'manual'", (entry_id,))
    return await list_entries(db)


# --------------------------------------------------------------------------- #
# bundles CRUD（サブスク・通信費）
# --------------------------------------------------------------------------- #
async def list_bundle_items(db, kind: str, month: str | None = None) -> list[dict]:
    """バンドル項目を {id,年月,名前,金額(int)} の保存順リストで返す。"""
    rows = await db.all(
        "SELECT id, month AS 年月, name AS 名前, amount AS 金額 FROM bundle_items "
        "WHERE kind = ? ORDER BY id",
        (kind,),
    )
    if month is not None:
        rows = [r for r in rows if r["年月"] == month]
    return rows


async def bundle_item_exists(db, item_id: int, kind: str) -> bool:
    rows = await db.all("SELECT 1 FROM bundle_items WHERE id = ? AND kind = ?", (item_id, kind))
    return bool(rows)


async def add_bundle_item(db, kind: str, month, name, amount) -> list[dict]:
    clean_month = str(month).strip()
    clean_name = str(name).strip()
    if not clean_name:
        raise ValueError("名前が空です")
    value = _validate_amount(amount)
    existing = await db.all(
        "SELECT 1 FROM bundle_items WHERE kind = ? AND month = ? AND name = ?",
        (kind, clean_month, clean_name),
    )
    if existing:
        raise ValueError(f"「{clean_name}」は{clean_month}にすでに登録されています")
    await db.run(
        "INSERT INTO bundle_items (kind, month, name, amount) VALUES (?, ?, ?, ?)",
        (kind, clean_month, clean_name, value),
    )
    return await list_bundle_items(db, kind)


async def update_bundle_amount(db, kind: str, item_id: int, amount) -> list[dict]:
    value = _validate_amount(amount)
    await db.run("UPDATE bundle_items SET amount = ? WHERE id = ? AND kind = ?", (value, item_id, kind))
    return await list_bundle_items(db, kind)


async def delete_bundle_item(db, kind: str, item_id: int) -> list[dict]:
    await db.run("DELETE FROM bundle_items WHERE id = ? AND kind = ?", (item_id, kind))
    return await list_bundle_items(db, kind)


# --------------------------------------------------------------------------- #
# goals
# --------------------------------------------------------------------------- #
GOAL_SOURCES = ("savings", "net_worth")


async def list_goals(db) -> list[dict]:
    return [
        {"name": g["name"], "target_amount": g["target_amount"], "source": g["source"]}
        for g in await db.all("SELECT name, target_amount, source FROM goals ORDER BY sort_order, name")
    ]


async def get_active_goal(db, config: dict | None = None) -> dict | None:
    """タブに表示する目標。未指定なら先頭。目標が無ければ None。"""
    config = config or await load_config(db)
    goals = config["goals"]
    if not goals:
        return None
    name = config.get("active_goal")
    for goal in goals:
        if goal["name"] == name:
            return goal
    return goals[0]


async def _next_goal_sort_order(db) -> int:
    rows = await db.all("SELECT COALESCE(MAX(sort_order), -1) AS m FROM goals")
    return int(rows[0]["m"]) + 1


async def add_goal(db, name, target_amount, source: str = "savings") -> list[dict]:
    clean = str(name).strip()
    if not clean:
        raise ValueError("目標名が空です")
    try:
        target = int(target_amount)
    except (TypeError, ValueError):
        raise ValueError("目標額は数値で入力してください")
    if target <= 0:
        raise ValueError("目標額は1以上で入力してください")
    if source not in GOAL_SOURCES:
        raise ValueError(f"不明な算出元です: {source}")
    if await db.all("SELECT 1 FROM goals WHERE name = ?", (clean,)):
        raise ValueError(f"目標「{clean}」はすでに存在します")
    await db.run(
        "INSERT INTO goals (name, target_amount, source, sort_order) VALUES (?, ?, ?, ?)",
        (clean, target, source, await _next_goal_sort_order(db)),
    )
    return await list_goals(db)


async def remove_goal(db, name: str) -> list[dict]:
    await db.run("DELETE FROM goals WHERE name = ?", (name,))
    # アクティブ目標が消えたら設定を掃除する
    active = await db.all("SELECT value FROM app_settings WHERE key = 'active_goal'")
    if active and active[0]["value"] == name:
        await db.run("DELETE FROM app_settings WHERE key = 'active_goal'")
    return await list_goals(db)


async def set_active_goal(db, name: str) -> list[dict]:
    if not await db.all("SELECT 1 FROM goals WHERE name = ?", (name,)):
        raise ValueError(f"目標「{name}」が存在しません")
    await _set_setting(db, "active_goal", name)
    return await list_goals(db)


# --------------------------------------------------------------------------- #
# categories / settings
# --------------------------------------------------------------------------- #
async def _set_setting(db, key: str, value: str) -> None:
    await db.run(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


async def set_investment_mode(db, investment_as_expense: bool) -> None:
    await _set_setting(db, "investment_as_expense", "true" if investment_as_expense else "false")


async def add_category(db, group: str, name: str, config: dict | None = None) -> None:
    clean = name.strip()
    if not clean:
        raise ValueError("カテゴリ名が空です")
    config = config or await load_config(db)
    if group not in config["categories"]:
        raise ValueError(f"不明なグループです: {group}")
    if clean in category_to_group(config):
        raise ValueError(f"カテゴリ「{clean}」はすでに存在します")
    rows = await db.all(
        "SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE group_name = ?", (group,)
    )
    await db.run(
        "INSERT INTO categories (name, group_name, income_owner, sort_order) VALUES (?, ?, NULL, ?)",
        (clean, group, int(rows[0]["m"]) + 1),
    )


async def category_usage(db) -> dict[str, int]:
    """カテゴリ名 -> entries での使用件数。"""
    rows = await db.all("SELECT category, COUNT(*) AS c FROM entries GROUP BY category")
    return {r["category"]: int(r["c"]) for r in rows}


async def remove_category(db, name: str, config: dict | None = None) -> None:
    """未使用カテゴリのみ削除できる。実績・特別な役割を持つカテゴリは拒否する。"""
    clean = name.strip()
    config = config or await load_config(db)
    if clean not in category_to_group(config):
        raise ValueError(f"カテゴリ「{clean}」は存在しません")
    if clean in config["income_owner"]:
        raise ValueError(f"「{clean}」は夫婦の収入内訳の集計に使う特別なカテゴリのため削除できません")
    if clean in {spec.label for spec in ALL_BUNDLES}:
        raise ValueError(f"「{clean}」は入力タブのサブスク／通信費の集計に使うため削除できません")
    used = (await category_usage(db)).get(clean, 0)
    if used:
        raise ValueError(
            f"「{clean}」は実績データ{used}件で使用中のため削除できません。"
            "先に該当データを修正または削除してください"
        )
    await db.run("DELETE FROM categories WHERE name = ?", (clean,))


# --------------------------------------------------------------------------- #
# 翌月作成（固定費・バンドルの引き継ぎ）
# --------------------------------------------------------------------------- #
async def create_next_month(db, config: dict | None = None) -> str:
    """翌月を作成し、作成した月(YYYY-MM)を返す。

    先月の固定費入力とサブスク・通信費を引き継ぎ、dashboard_months に登録する。
    既に対象月へ引き継ぎ済みなら二重登録しない（冪等）。
    """
    config = config or await load_config(db)
    months = await all_months(db)
    if not months:
        raise ValueError("基準となる月がありません。先に当月のデータを入力してください。")
    base = months[-1]
    target = next_month(base)

    mapping = category_to_group(config)
    fixed_cats = [c for c, g in mapping.items() if g == FIXED_COST_GROUP]

    # 固定費エントリの引き継ぎ（対象月に固定費が無いときだけ）
    if fixed_cats:
        placeholders = ",".join("?" for _ in fixed_cats)
        already = await db.all(
            f"SELECT 1 FROM entries WHERE month = ? AND category IN ({placeholders}) LIMIT 1",
            (target, *fixed_cats),
        )
        if not already:
            base_fixed = await db.all(
                f"SELECT category, amount FROM entries WHERE month = ? AND category IN ({placeholders}) ORDER BY id",
                (base, *fixed_cats),
            )
            for row in base_fixed:
                await db.run(
                    "INSERT INTO entries (month, category, amount, source) VALUES (?, ?, ?, 'manual')",
                    (target, row["category"], row["amount"]),
                )

    # サブスク・通信費の引き継ぎ（対象月に項目が無いときだけ）
    for spec in ALL_BUNDLES:
        has_target = await db.all(
            "SELECT 1 FROM bundle_items WHERE kind = ? AND month = ? LIMIT 1", (spec.key, target)
        )
        if has_target:
            continue
        base_items = await db.all(
            "SELECT name, amount FROM bundle_items WHERE kind = ? AND month = ? ORDER BY id",
            (spec.key, base),
        )
        for row in base_items:
            await db.run(
                "INSERT INTO bundle_items (kind, month, name, amount) VALUES (?, ?, ?, ?)",
                (spec.key, target, row["name"], row["amount"]),
            )

    await db.run("INSERT OR IGNORE INTO dashboard_months (month) VALUES (?)", (target,))
    return target
