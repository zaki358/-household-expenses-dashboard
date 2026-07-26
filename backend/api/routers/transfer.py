"""CSV取込・書き出しエンドポイント。

- POST /api/import/csv?dry_run=  … 生バイトのbody（python-multipart不要）
- GET  /api/export/entries.csv   … 全entriesを 年月,カテゴリ,金額 で
- GET  /api/export/bundles/{kind}.csv … サブスク/通信費を 年月,名前,金額 で
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from api.deps import get_db
from src import repo
from src.db import Database
from src.exporter import export_bundle_csv, export_entries_csv
from src.importer import analyze_entries_csv, commit_entries

router = APIRouter(prefix="/api", tags=["transfer"])

_VALID_KINDS = {"subscriptions", "communications"}


def _csv_response(text: str, filename: str) -> Response:
    # Excel/スプレッドシート互換のため BOM 付き utf-8 で返す
    return Response(
        content=text.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import/csv")
async def import_csv(request: Request, dry_run: bool = Query(default=True),
                     db: Database = Depends(get_db)) -> dict:
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="CSVデータが空です")
    config = await repo.load_config(db)
    report = analyze_entries_csv(raw, config)
    if not report["ok"]:
        raise HTTPException(status_code=400, detail=report["error"])
    committed = 0
    if not dry_run:
        committed = await commit_entries(db, report["proposals"])
    return {**report, "dry_run": dry_run, "committed": committed}


@router.get("/export/entries.csv")
async def export_entries(db: Database = Depends(get_db)) -> Response:
    return _csv_response(await export_entries_csv(db), "entries.csv")


@router.get("/export/bundles/{kind}.csv")
async def export_bundles(kind: str, db: Database = Depends(get_db)) -> Response:
    if kind not in _VALID_KINDS:
        raise HTTPException(status_code=404, detail=f"不明なバンドル種別です: {kind}")
    return _csv_response(await export_bundle_csv(db, kind), f"{kind}.csv")
