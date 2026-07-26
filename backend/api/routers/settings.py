"""投資の扱い・カテゴリ管理・設定全体の取得。"""

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_db
from api.schemas import CategoryCreate, ConfigOut, InvestmentModeUpdate
from src import repo
from src.db import Database

router = APIRouter(prefix="/api/config", tags=["settings"])


async def _config_out(db: Database) -> ConfigOut:
    config = await repo.load_config(db)
    return ConfigOut(
        investment_as_expense=bool(config["investment_as_expense"]),
        categories=config["categories"],
        category_usage=await repo.category_usage(db),
        active_goal=config["active_goal"],
        dashboard_months=list(config["dashboard_months"]),
    )


@router.get("", response_model=ConfigOut)
async def get_config(db: Database = Depends(get_db)) -> ConfigOut:
    return await _config_out(db)


@router.put("/investment-mode", response_model=ConfigOut)
async def update_investment_mode(payload: InvestmentModeUpdate,
                                 db: Database = Depends(get_db)) -> ConfigOut:
    await repo.set_investment_mode(db, payload.investment_as_expense)
    return await _config_out(db)


@router.post("/categories", response_model=ConfigOut)
async def create_category(payload: CategoryCreate,
                          db: Database = Depends(get_db)) -> ConfigOut:
    config = await repo.load_config(db)
    try:
        await repo.add_category(db, payload.group, payload.name, config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await _config_out(db)


@router.delete("/categories/{name}", response_model=ConfigOut)
async def delete_category(name: str, db: Database = Depends(get_db)) -> ConfigOut:
    try:
        await repo.remove_category(db, name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await _config_out(db)
