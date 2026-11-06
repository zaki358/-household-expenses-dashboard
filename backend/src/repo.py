"""全 SQL アクセスを集約するリポジトリ層。

上位（ルーター・集計）は Database Protocol とこのモジュールにだけ依存する。
load_config は旧 config.yaml と同じ形の dict を返すため、config.py の純関数
（category_to_group / get_goals 等）や aggregate/goal はそのまま使える。
"""

from src.bundle_store import ALL_BUNDLES
from src.dates import current_month, days_in_month, next_month, normalize_month

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
# state（config + dataset + all_months をまとめて取得）
# --------------------------------------------------------------------------- #
async def load_state(db) -> tuple[dict, list[dict], list[str], list[str]]:
    """config・データセット・全月をまとめて取得する（読み取り3エンドポイント共通）。

    TypeScript版（worker/src/repo.ts の loadState）は Cloudflare D1 がネット
    ワーク越しのサービスであるため、db.batchAll() で9クエリを1往復にまとめて
    レイテンシを削減している。こちら（ローカル/テスト用の SqliteDatabase）は
    同一プロセス内のファイルアクセスで往復コストが実質ゼロなため、バッチ化
    せず素直に逐次呼び出す。戻り値の形（config, rows, warnings, months）は
    TS版と揃えてあるので、呼び出し側の書き方は対称になる。
    """
    config = await load_config(db)
    rows, warnings = await load_dataset(db, config)
    months = await all_months(db)
    return config, rows, warnings, months


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

    割り勘ID は割り勘アプリへの反映先の支出ID（未反映は None）。反映そのものは
    Service Binding が必要で Worker 専用だが、JSONの形を TypeScript 版と揃えるため
    この列も同じキー名で返す。
    """
    rows = await db.all(
        "SELECT id, month AS 年月, category AS カテゴリ, amount AS 金額, note AS 備考, day AS 日, "
        "warikan_expense_id AS 割り勘ID FROM entries "
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


# update_entry で「day に触らない」と「day をクリア(None)」を区別するための番兵。
UNSET = object()


def _validate_day(day, month: str) -> int | None:
    """日（任意）を検証する。None は「日付なし」。1〜その月の末日の整数のみ許可。"""
    if day is None:
        return None
    if isinstance(day, bool) or not isinstance(day, int):
        raise ValueError("日は整数で入力してください")
    last = days_in_month(month)
    if not (1 <= day <= last):
        raise ValueError(f"日は1〜{last}の範囲で入力してください")
    return day


async def add_entry(db, config: dict, month, category, amount, note: str = "", day=None) -> list[dict]:
    """検証してから entries に1行追加し、更新後の全件を返す。"""
    try:
        normalized_month = normalize_month(month)
    except Exception:
        raise ValueError("年月の形式が不正です（例: 2026-06）")
    cat = str(category).strip()
    if cat not in category_to_group(config):
        raise ValueError(f"カテゴリ「{cat}」は登録されていません")
    value = _validate_amount(amount)
    clean_note = str(note or "").strip()
    clean_day = _validate_day(day, normalized_month)
    await db.run(
        "INSERT INTO entries (month, category, amount, note, day, source) VALUES (?, ?, ?, ?, ?, 'manual')",
        (normalized_month, cat, value, clean_note, clean_day),
    )
    return await list_entries(db)


async def update_entry(
    db, config: dict, entry_id: int, amount, category: str | None = None, note: str | None = None,
    day=UNSET,
) -> list[dict]:
    """金額に加え、カテゴリ・備考・日も更新できる。category/note が None ならその列に触らない
    （amount だけの旧呼び出しとの後方互換のため）。note に空文字を渡すのは「クリア」扱い。
    day は UNSET（既定）なら触らず、None なら日付をクリアする。
    """
    value = _validate_amount(amount)
    sets = ["amount = ?"]
    params: list = [value]

    if category is not None:
        cat = category.strip()
        if cat not in category_to_group(config):
            raise ValueError(f"カテゴリ「{cat}」は登録されていません")
        sets.append("category = ?")
        params.append(cat)
    if note is not None:
        sets.append("note = ?")
        params.append(note.strip())
    if day is not UNSET:
        rows = await db.all("SELECT month FROM entries WHERE id = ?", (entry_id,))
        if rows:
            sets.append("day = ?")
            params.append(_validate_day(day, rows[0]["month"]))

    params.append(entry_id)
    await db.run(f"UPDATE entries SET {', '.join(sets)} WHERE id = ? AND source = 'manual'", tuple(params))
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


async def update_bundle_item(db, kind: str, item_id: int, amount, name: str | None = None) -> list[dict]:
    """金額に加え、項目名も更新できる。name が None ならその列に触らない
    （amount だけの旧呼び出しとの後方互換のため）。
    """
    value = _validate_amount(amount)

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("名前が空です")
        row = await db.all("SELECT month FROM bundle_items WHERE id = ? AND kind = ?", (item_id, kind))
        if row:
            month = row[0]["month"]
            dup = await db.all(
                "SELECT 1 FROM bundle_items WHERE kind = ? AND month = ? AND name = ? AND id != ?",
                (kind, month, clean_name, item_id),
            )
            if dup:
                raise ValueError(f"「{clean_name}」は{month}にすでに登録されています")
        await db.run(
            "UPDATE bundle_items SET amount = ?, name = ? WHERE id = ? AND kind = ?",
            (value, clean_name, item_id, kind),
        )
        return await list_bundle_items(db, kind)

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
# 月の準備（固定費・バンドルの引き継ぎ）— ensure_month / ensure_current_month / create_next_month
# --------------------------------------------------------------------------- #
async def previous_data_month(db, target: str) -> str | None:
    """target より前で実データ（entries または bundle_items）を持つ最新月。無ければ None。

    dashboard_months は意図的にUNIONしない — 迷子の未来月や中身が空の準備済み月が
    base に選ばれるのを防ぐため（前者は all_months() の最大値を base にすると起きる事故、
    後者は「準備はしたが引き継ぐものが無かった月」を base にすると何も引き継がれない事故）。
    """
    rows = await db.all(
        "SELECT MAX(month) AS m FROM ("
        " SELECT month FROM entries WHERE month < ?"
        " UNION"
        " SELECT month FROM bundle_items WHERE month < ?"
        ")",
        (target, target),
    )
    return rows[0]["m"] if rows and rows[0]["m"] is not None else None


async def ensure_month(db, month, config: dict | None = None) -> dict:
    """指定した月(month)を準備する: 直前の実データ月から固定費・サブスク・通信費を引き継ぎ、
    dashboard_months に登録する。既に登録済みなら何もせず {"created": False} を返す（冪等）。

    このマーカーが「準備後に手動で全部消しても再度引き継がれない」ことを保証する
    （all_months() は dashboard_months をUNIONするため、その月は summary.months に残り続け、
    呼び出し側の「今月がまだ無い」判定が再び真になることはない）。

    create_next_month と将来の自動準備トリガーが共有する唯一の実装（TS版 worker/src/repo.ts
    の ensureMonth と対）。
    """
    try:
        target = normalize_month(month)
    except Exception:
        raise ValueError("年月の形式が不正です（例: 2026-08）")

    already = await db.all("SELECT 1 FROM dashboard_months WHERE month = ? LIMIT 1", (target,))
    if already:
        return {"month": target, "created": False, "base": None, "carried_entries": 0, "carried_bundle_items": 0}

    base = await previous_data_month(db, target)
    statements: list[tuple[str, tuple]] = []
    carried_entries = 0
    carried_bundle_items = 0

    if base is not None:
        config = config or await load_config(db)
        mapping = category_to_group(config)
        fixed_cats = [c for c, g in mapping.items() if g == FIXED_COST_GROUP]

        # 固定費エントリの引き継ぎ（対象月に固定費が無いときだけ）
        if fixed_cats:
            placeholders = ",".join("?" for _ in fixed_cats)
            already_fixed = await db.all(
                f"SELECT 1 FROM entries WHERE month = ? AND category IN ({placeholders}) LIMIT 1",
                (target, *fixed_cats),
            )
            if not already_fixed:
                base_fixed = await db.all(
                    f"SELECT category, amount, note FROM entries WHERE month = ? AND category IN ({placeholders}) ORDER BY id",
                    (base, *fixed_cats),
                )
                for row in base_fixed:
                    statements.append((
                        "INSERT INTO entries (month, category, amount, note, source) VALUES (?, ?, ?, ?, 'manual')",
                        (target, row["category"], row["amount"], row["note"]),
                    ))
                    carried_entries += 1

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
                statements.append((
                    # UNIQUE (kind, month, name) があるため OR IGNORE で途中失敗後の再試行を安全にする
                    "INSERT OR IGNORE INTO bundle_items (kind, month, name, amount) VALUES (?, ?, ?, ?)",
                    (spec.key, target, row["name"], row["amount"]),
                ))
                carried_bundle_items += 1

    statements.append(("INSERT OR IGNORE INTO dashboard_months (month) VALUES (?)", (target,)))
    # 1トランザクションにまとめ、「半分だけ引き継がれた月」が起きないようにする
    await db.batch(statements)

    return {
        "month": target,
        "created": True,
        "base": base,
        "carried_entries": carried_entries,
        "carried_bundle_items": carried_bundle_items,
    }


async def ensure_current_month(db, config: dict | None = None, today: str | None = None) -> dict:
    """今月(JST)を準備する。データが一件も無い完全な初回起動では何もしない
    （base が無いので引き継ぐ物も無く、marker だけ書くのを避けて空状態のオンボーディングを保つ）。
    """
    target = today or current_month()
    months = await all_months(db)
    if not months:
        return {"month": target, "created": False, "base": None, "carried_entries": 0, "carried_bundle_items": 0}
    return await ensure_month(db, target, config)


async def create_next_month(db, config: dict | None = None) -> str:
    """翌月を作成し、作成した月(YYYY-MM)を返す（設定タブの「➕ 翌月を作成」ボタン用）。"""
    months = await all_months(db)
    if not months:
        raise ValueError("基準となる月がありません。先に当月のデータを入力してください。")
    target = next_month(months[-1])
    result = await ensure_month(db, target, config)
    return result["month"]


# --------------------------------------------------------------------------- #
# 月削除（誤って作成した翌月シートの取り消し用）
# --------------------------------------------------------------------------- #
async def delete_month(db, month, today: str | None = None) -> dict:
    """指定した月の entries・bundle_items・dashboard_months をまとめて削除する。

    「1つの月」はこの3テーブルに分散しており外部キーも無いため、3つとも消さないと
    all_months()（UNION）にその月が残ってしまう。db.batch は1トランザクションなので、
    ここに乗せることで一部だけ消える事故を防ぐ（TS版 worker/src/repo.ts の deleteMonth と対）。

    中間の月を消すと monthlySummary の累計（貯金・投資・純資産）が以降の全月でズレるため、
    「今月より後」の月のみ許可する。source（manual/import）は問わず、その月の行は
    すべて削除する（source='manual' に絞ると import 行が残り「消したのに月が消えない」
    事故になる）。
    """
    try:
        target = normalize_month(month)
    except Exception:
        raise ValueError("年月の形式が不正です（例: 2026-08）")
    current = today or current_month()
    if target <= current:
        raise ValueError(f"{target} は削除できません。今月({current})より後の月のみ削除できます。")

    entries_count = await db.all("SELECT COUNT(*) AS c FROM entries WHERE month = ?", (target,))
    bundle_count = await db.all("SELECT COUNT(*) AS c FROM bundle_items WHERE month = ?", (target,))
    deleted_entries = int(entries_count[0]["c"]) if entries_count else 0
    deleted_bundle_items = int(bundle_count[0]["c"]) if bundle_count else 0

    await db.batch([
        ("DELETE FROM entries WHERE month = ?", (target,)),
        ("DELETE FROM bundle_items WHERE month = ?", (target,)),
        ("DELETE FROM dashboard_months WHERE month = ?", (target,)),
    ])

    return {"month": target, "deleted_entries": deleted_entries, "deleted_bundle_items": deleted_bundle_items}
