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


class EntryCreate(BaseModel):
    month: str
    category: str
    amount: int


class AmountUpdate(BaseModel):
    amount: int


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
