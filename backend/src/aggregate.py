"""月次集計と KPI 計算（pandas 非依存の純 Python 実装）。

貯金額の定義（投資の扱いによらず現金ベースは同じ）:
    月間貯金額 = 収入 - 投資以外の支出 - 投資額
表示上の「月支出」のみ設定で変わる:
    投資=支出 のとき: 月支出 = 投資以外の支出 + 投資額
    投資=資産移動 のとき: 月支出 = 投資以外の支出

入力 `rows` は {年月, カテゴリ, 金額(float), グループ} の辞書リスト（repo.load_dataset の出力）。
金額は float で扱い、旧 pandas 版と同じく集計結果も float で返す。
"""

SUMMARY_COLUMNS = [
    "年月", "収入", "夫収入", "妻収入", "支出", "投資",
    "貯金", "累計貯金", "投資累計", "純資産",
]

_NUMERIC_COLUMNS = ["収入", "夫収入", "妻収入", "支出", "投資", "貯金"]


def monthly_summary(rows: list[dict], config: dict,
                    ensure_months: list[str] | None = None) -> list[dict]:
    """月ごとの収支・貯金・純資産をまとめた辞書リストを返す。

    ensure_months を渡すと、データが無い月も 0 埋めで必ず含める。
    """
    ensure = set(ensure_months or [])
    if not rows and not ensure:
        return []

    invest_as_expense = bool(config.get("investment_as_expense", True))
    income_owner = config.get("income_owner", {})
    husband_cats = {c for c, owner in income_owner.items() if owner == "夫"}
    wife_cats = {c for c, owner in income_owner.items() if owner == "妻"}

    by_month: dict[str, list[dict]] = {}
    for row in rows:
        by_month.setdefault(row["年月"], []).append(row)

    computed: dict[str, dict] = {}
    for month, month_rows in by_month.items():
        income = sum(r["金額"] for r in month_rows if r["グループ"] == "収入")
        husband = sum(r["金額"] for r in month_rows if r["カテゴリ"] in husband_cats)
        wife = sum(r["金額"] for r in month_rows if r["カテゴリ"] in wife_cats)
        invest = sum(r["金額"] for r in month_rows if r["グループ"] == "投資")
        spending = sum(r["金額"] for r in month_rows if r["グループ"] not in ("収入", "投資"))
        expense = spending + invest if invest_as_expense else spending
        savings = income - spending - invest
        computed[month] = {
            "年月": month, "収入": income, "夫収入": husband, "妻収入": wife,
            "支出": expense, "投資": invest, "貯金": savings,
        }

    all_months = sorted(set(computed) | ensure)
    if not all_months:
        return []

    result: list[dict] = []
    cum_savings = 0.0
    cum_invest = 0.0
    for month in all_months:
        base = computed.get(month)
        values = {col: float(base[col]) for col in _NUMERIC_COLUMNS} if base \
            else {col: 0.0 for col in _NUMERIC_COLUMNS}
        cum_savings += values["貯金"]
        cum_invest += values["投資"]
        result.append({
            "年月": month,
            **values,
            "累計貯金": cum_savings,
            "投資累計": cum_invest,
            "純資産": cum_savings + cum_invest,
        })
    return result


def expense_breakdown(rows: list[dict], config: dict, month: str) -> list[dict]:
    """指定月の支出内訳（カテゴリ別）。円グラフ用。金額降順、同額はカテゴリ昇順。"""
    invest_as_expense = bool(config.get("investment_as_expense", True))
    excluded = {"収入"} if invest_as_expense else {"収入", "投資"}

    totals: dict[tuple[str, str], float] = {}
    for row in rows:
        if row["年月"] != month or row["グループ"] in excluded:
            continue
        key = (row["カテゴリ"], row["グループ"])
        totals[key] = totals.get(key, 0.0) + float(row["金額"])

    items = [
        {"カテゴリ": cat, "グループ": grp, "金額": amount}
        for (cat, grp), amount in totals.items() if amount > 0
    ]
    # pandas groupby(sort=True) → カテゴリ,グループ 昇順に整列してから金額降順(安定ソート)
    items.sort(key=lambda x: (x["カテゴリ"], x["グループ"]))
    items.sort(key=lambda x: x["金額"], reverse=True)
    return items


def group_totals(rows: list[dict], month: str) -> list[dict]:
    """指定月のグループ別合計（収入を除く）。前月比較棒グラフ用。グループ名昇順。"""
    totals: dict[str, float] = {}
    for row in rows:
        if row["年月"] != month or row["グループ"] == "収入":
            continue
        totals[row["グループ"]] = totals.get(row["グループ"], 0.0) + float(row["金額"])
    return [{"グループ": grp, "金額": totals[grp]} for grp in sorted(totals)]


def previous_month(summary: list[dict], month: str) -> str | None:
    """summary 内で month の直前の月を返す。なければ None。"""
    months = [r["年月"] for r in summary]
    if month not in months:
        return None
    idx = months.index(month)
    return months[idx - 1] if idx > 0 else None


def compare_months(summary: list[dict], month: str) -> list[dict] | None:
    """今月と前月の差額・増減率を返す。前月がなければ None。"""
    prev = previous_month(summary, month)
    if prev is None:
        return None
    cur_row = next(r for r in summary if r["年月"] == month)
    prev_row = next(r for r in summary if r["年月"] == prev)

    result = []
    for item in ["収入", "支出", "投資", "貯金"]:
        current, previous = float(cur_row[item]), float(prev_row[item])
        diff = current - previous
        rate = (diff / abs(previous) * 100) if previous != 0 else None
        result.append({
            "項目": item, "今月": current, "前月": previous,
            "差額": diff, "増減率": rate,
        })
    return result
