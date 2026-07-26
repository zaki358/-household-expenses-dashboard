"""目標（結婚資金・車の買い替え等）の達成状況計算（pandas 非依存）。

summary は monthly_summary() の出力（辞書リスト、年月昇順）。
"""

from src.dates import add_months

# 予想達成日の算出に使う直近の月数
PACE_WINDOW_MONTHS = 6


def goal_status(summary: list[dict], goal: dict) -> dict:
    """目標の現在額・達成率・残額・予想達成日を計算する。

    goal: {"name": 目標名, "target_amount": 目標額, "source": "savings"|"net_worth"}
    """
    name = goal.get("name", "目標")
    target = float(goal.get("target_amount", 0))
    source = goal.get("source", "savings")

    if not summary or target <= 0:
        return {
            "名前": name, "目標額": target, "現在額": 0.0, "達成率": 0.0,
            "残額": target, "予想達成日": None, "月平均貯金": 0.0,
        }

    column = "純資産" if source == "net_worth" else "累計貯金"
    current = float(summary[-1][column])
    remaining = max(target - current, 0.0)
    # 達成率は 0〜100% にクリップする（現在額がマイナスでも進捗は0%）。
    rate = min(max(current / target * 100, 0.0), 100.0)

    pace = _monthly_pace(summary, source)
    eta = _estimate_completion(summary, remaining, pace)

    return {
        "名前": name, "目標額": target, "現在額": current, "達成率": rate,
        "残額": remaining, "予想達成日": eta, "月平均貯金": pace,
    }


def _monthly_pace(summary: list[dict], source: str) -> float:
    """直近 PACE_WINDOW_MONTHS ヶ月の平均月間積み上げ額。"""
    if source == "net_worth":
        monthly = [r["貯金"] + r["投資"] for r in summary]
    else:
        monthly = [r["貯金"] for r in summary]
    recent = monthly[-PACE_WINDOW_MONTHS:]
    return float(sum(recent) / len(recent)) if recent else 0.0


def _estimate_completion(summary: list[dict], remaining: float, pace: float) -> str | None:
    """残額と月平均ペースから予想達成月 (YYYY-MM) を返す。達成済みなら最新月。"""
    last_month = summary[-1]["年月"]
    if remaining <= 0:
        return last_month
    if pace <= 0:
        return None  # 積み上げペースがマイナス → 達成見込みなし
    months_needed = int(-(-remaining // pace))  # 切り上げ
    return add_months(last_month, months_needed)
