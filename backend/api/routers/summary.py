"""読み取り専用のサマリー・ダッシュボード・グラフ用エンドポイント。

集計ロジック（src.aggregate）は純関数。ルーターは repo でデータを取り、
集計を呼んで JSON 化するだけ。
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from api.deps import get_db
from api.schemas import ChartsResponse, DashboardResponse, SummaryResponse
from src import repo
from src.aggregate import (
    compare_months,
    expense_breakdown,
    group_totals,
    monthly_summary,
    previous_month,
)
from src.db import Database

router = APIRouter(prefix="/api", tags=["summary"])


async def _state(db: Database):
    config = await repo.load_config(db)
    rows, warnings = await repo.load_dataset(db, config)
    months = await repo.all_months(db)
    summary = monthly_summary(rows, config, ensure_months=months)
    return config, rows, warnings, summary, months


def _resolve_month(months: list[str], month: str | None) -> str:
    if not months:
        raise HTTPException(status_code=404, detail="データがありません")
    target = month or months[-1]
    if target not in months:
        raise HTTPException(status_code=404, detail=f"指定した月のデータがありません: {target}")
    return target


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(db: Database = Depends(get_db)) -> SummaryResponse:
    _, _, warnings, summary, months = await _state(db)
    return SummaryResponse(months=months, summary=summary, warnings=warnings)


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(month: str | None = Query(default=None),
                        db: Database = Depends(get_db)) -> DashboardResponse:
    _, _, _, summary, months = await _state(db)
    target = _resolve_month(months, month)
    current = next(r for r in summary if r["年月"] == target)
    comparison = compare_months(summary, target)
    return DashboardResponse(month=target, current=current, comparison=comparison)


@router.get("/charts", response_model=ChartsResponse)
async def get_charts(month: str | None = Query(default=None),
                     db: Database = Depends(get_db)) -> ChartsResponse:
    config, rows, _, summary, months = await _state(db)
    target = _resolve_month(months, month)

    breakdown = expense_breakdown(rows, config, target)
    current_totals = group_totals(rows, target)
    prev = previous_month(summary, target)
    previous_totals = group_totals(rows, prev) if prev is not None else []

    return ChartsResponse(
        month=target,
        expense_breakdown=breakdown,
        group_totals_current=[{**t, "月": target} for t in current_totals],
        group_totals_previous=[{**t, "月": prev or ""} for t in previous_totals],
        trend=summary,
    )
