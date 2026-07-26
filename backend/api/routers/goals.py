"""目標の一覧・追加・削除・アクティブ切替・達成状況。"""

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_db
from api.schemas import ActiveGoalUpdate, Goal, GoalCreate, GoalStatus
from src import repo
from src.aggregate import monthly_summary
from src.db import Database
from src.goal import goal_status

router = APIRouter(prefix="/api/goals", tags=["goals"])


@router.get("", response_model=list[Goal])
async def list_goals(db: Database = Depends(get_db)) -> list[Goal]:
    return await repo.list_goals(db)


@router.get("/status", response_model=GoalStatus | None)
async def get_status(db: Database = Depends(get_db)) -> GoalStatus | None:
    config = await repo.load_config(db)
    active = await repo.get_active_goal(db, config)
    if active is None:
        return None
    rows, _ = await repo.load_dataset(db, config)
    months = await repo.all_months(db)
    summary = monthly_summary(rows, config, ensure_months=months)
    return GoalStatus(**goal_status(summary, active))


@router.post("", response_model=list[Goal])
async def create_goal(payload: GoalCreate, db: Database = Depends(get_db)) -> list[Goal]:
    try:
        return await repo.add_goal(db, payload.name, payload.target_amount, payload.source)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{name}", response_model=list[Goal])
async def delete_goal(name: str, db: Database = Depends(get_db)) -> list[Goal]:
    return await repo.remove_goal(db, name)


@router.put("/active", response_model=list[Goal])
async def set_active(payload: ActiveGoalUpdate, db: Database = Depends(get_db)) -> list[Goal]:
    try:
        return await repo.set_active_goal(db, payload.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
