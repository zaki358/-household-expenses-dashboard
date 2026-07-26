"""収入・固定費・インフラ・投資（ダッシュボード手入力）の CRUD。

検証は src.repo（＋純関数）で行い、DB を更新して更新後の全件を返す。
取込(import)分は編集対象にしない（repo.list_entries が source='manual' のみ返す）。
"""

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_db
from api.schemas import AmountUpdate, EntryCreate, IndexedEntry
from src import repo
from src.db import Database

router = APIRouter(prefix="/api/entries", tags=["entries"])


@router.get("", response_model=list[IndexedEntry])
async def list_entries(month: str | None = None, group: str | None = None,
                       db: Database = Depends(get_db)) -> list[IndexedEntry]:
    return await repo.list_entries(db, month=month, group=group)


@router.post("", response_model=list[IndexedEntry])
async def create_entry(payload: EntryCreate, db: Database = Depends(get_db)) -> list[IndexedEntry]:
    config = await repo.load_config(db)
    try:
        return await repo.add_entry(db, config, payload.month, payload.category, payload.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{entry_id}", response_model=list[IndexedEntry])
async def update_entry_amount(entry_id: int, payload: AmountUpdate,
                              db: Database = Depends(get_db)) -> list[IndexedEntry]:
    if not await repo.entry_exists(db, entry_id):
        raise HTTPException(status_code=404, detail="エントリが存在しません")
    try:
        return await repo.update_entry_amount(db, entry_id, payload.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{entry_id}", response_model=list[IndexedEntry])
async def delete_entry(entry_id: int, db: Database = Depends(get_db)) -> list[IndexedEntry]:
    if not await repo.entry_exists(db, entry_id):
        raise HTTPException(status_code=404, detail="エントリが存在しません")
    return await repo.delete_entry(db, entry_id)
