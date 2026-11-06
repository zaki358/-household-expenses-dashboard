"""サブスク・通信費（月ごと項目別バンドル）の CRUD。

kind は "subscriptions" | "communications"。検証は src.repo で行う。
"""

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_db
from api.schemas import BundleItemCreate, BundleItemUpdate, IndexedBundleItem
from src import repo
from src.db import Database

router = APIRouter(prefix="/api/bundles", tags=["bundles"])

_VALID_KINDS = {"subscriptions", "communications"}


def _check_kind(kind: str) -> None:
    if kind not in _VALID_KINDS:
        raise HTTPException(status_code=404, detail=f"不明なバンドル種別です: {kind}")


@router.get("/{kind}", response_model=list[IndexedBundleItem])
async def list_items(kind: str, month: str | None = None,
                     db: Database = Depends(get_db)) -> list[IndexedBundleItem]:
    _check_kind(kind)
    return await repo.list_bundle_items(db, kind, month=month)


@router.post("/{kind}", response_model=list[IndexedBundleItem])
async def create_item(kind: str, payload: BundleItemCreate,
                      db: Database = Depends(get_db)) -> list[IndexedBundleItem]:
    _check_kind(kind)
    try:
        return await repo.add_bundle_item(db, kind, payload.month, payload.name, payload.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{kind}/{item_id}", response_model=list[IndexedBundleItem])
async def update_item(kind: str, item_id: int, payload: BundleItemUpdate,
                      db: Database = Depends(get_db)) -> list[IndexedBundleItem]:
    _check_kind(kind)
    if not await repo.bundle_item_exists(db, item_id, kind):
        raise HTTPException(status_code=404, detail="項目が存在しません")
    try:
        return await repo.update_bundle_item(db, kind, item_id, payload.amount, payload.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{kind}/{item_id}", response_model=list[IndexedBundleItem])
async def delete_item(kind: str, item_id: int,
                      db: Database = Depends(get_db)) -> list[IndexedBundleItem]:
    _check_kind(kind)
    if not await repo.bundle_item_exists(db, item_id, kind):
        raise HTTPException(status_code=404, detail="項目が存在しません")
    return await repo.delete_bundle_item(db, kind, item_id)
