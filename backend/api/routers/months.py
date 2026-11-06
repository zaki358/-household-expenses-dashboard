"""翌月作成（固定費・サブスク・通信費の引き継ぎ）／誤って作成した月の削除。"""

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_db
from api.schemas import EnsureMonthResponse, MonthDeleteResponse, NextMonthResponse
from src import repo
from src.db import Database

router = APIRouter(prefix="/api/months", tags=["months"])


@router.post("/next", response_model=NextMonthResponse)
async def create_next(db: Database = Depends(get_db)) -> NextMonthResponse:
    try:
        target = await repo.create_next_month(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return NextMonthResponse(month=target)


@router.post("/ensure-current", response_model=EnsureMonthResponse)
async def ensure_current(db: Database = Depends(get_db)) -> EnsureMonthResponse:
    try:
        result = await repo.ensure_current_month(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return EnsureMonthResponse(**result)


@router.delete("/{month}", response_model=MonthDeleteResponse)
async def delete_month(month: str, db: Database = Depends(get_db)) -> MonthDeleteResponse:
    try:
        result = await repo.delete_month(db, month)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return MonthDeleteResponse(**result)
