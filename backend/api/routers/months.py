"""翌月作成（固定費・サブスク・通信費の引き継ぎ）。"""

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_db
from api.schemas import NextMonthResponse
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
