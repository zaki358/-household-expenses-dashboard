"""API レスポンス用 Pydantic モデル。"""

from typing import Literal

from pydantic import BaseModel

GoalSource = Literal["savings", "net_worth"]


class MonthlySummaryRow(BaseModel):
    年月: str
    収入: float
    夫収入: float
    妻収入: float
    支出: float
    投資: float
    貯金: float
    累計貯金: float
    投資累計: float
    純資産: float


class SummaryResponse(BaseModel):
    months: list[str]
    summary: list[MonthlySummaryRow]
    warnings: list[str]
    current_month: str


class ComparisonRow(BaseModel):
    項目: str
    今月: float
    前月: float
    差額: float
    増減率: float | None = None


class DashboardResponse(BaseModel):
    month: str
    current: MonthlySummaryRow
    comparison: list[ComparisonRow] | None


class ExpenseBreakdownRow(BaseModel):
    カテゴリ: str
    グループ: str
    金額: float


class GroupTotalRow(BaseModel):
    グループ: str
    金額: float
    月: str


class ChartsResponse(BaseModel):
    month: str
    expense_breakdown: list[ExpenseBreakdownRow]
    group_totals_current: list[GroupTotalRow]
    group_totals_previous: list[GroupTotalRow]
    trend: list[MonthlySummaryRow]


class IndexedEntry(BaseModel):
    id: int
    年月: str
    カテゴリ: str
    金額: int
    備考: str
    日: int | None = None
    # 割り勘アプリへの反映先の支出ID（未反映は None）。反映操作は Worker 専用。
    割り勘ID: str | None = None


class EntryCreate(BaseModel):
    month: str
    category: str
    amount: int
    note: str = ""
    day: int | None = None


class EntryUpdate(BaseModel):
    amount: int
    category: str | None = None
    note: str | None = None
    # 未送信なら日付に触らない／null を明示的に送ったらクリア（router で model_fields_set を見て区別する）
    day: int | None = None


class BundleItemUpdate(BaseModel):
    amount: int
    name: str | None = None


class IndexedBundleItem(BaseModel):
    id: int
    年月: str
    名前: str
    金額: int


class BundleItemCreate(BaseModel):
    month: str
    name: str
    amount: int


class Goal(BaseModel):
    name: str
    target_amount: int
    source: GoalSource


class GoalCreate(BaseModel):
    name: str
    target_amount: int
    source: GoalSource = "savings"


class ActiveGoalUpdate(BaseModel):
    name: str


class GoalStatus(BaseModel):
    名前: str
    目標額: float
    現在額: float
    達成率: float
    残額: float
    予想達成日: str | None
    月平均貯金: float


class NextMonthResponse(BaseModel):
    month: str


class EnsureMonthResponse(BaseModel):
    month: str
    created: bool
    base: str | None
    carried_entries: int
    carried_bundle_items: int


class MonthDeleteResponse(BaseModel):
    month: str
    deleted_entries: int
    deleted_bundle_items: int


class InvestmentModeUpdate(BaseModel):
    investment_as_expense: bool


class CategoryCreate(BaseModel):
    group: str
    name: str


class ConfigOut(BaseModel):
    investment_as_expense: bool
    categories: dict[str, list[str]]
    category_usage: dict[str, int]
    active_goal: str | None
    dashboard_months: list[str]
