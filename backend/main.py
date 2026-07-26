"""家計簿ダッシュボード2 API サーバー

起動方法:
    uvicorn main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import bundles, entries, goals, months, settings, summary, transfer

app = FastAPI(title="家計簿ダッシュボード3 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(summary.router)
app.include_router(entries.router)
app.include_router(bundles.router)
app.include_router(goals.router)
app.include_router(months.router)
app.include_router(settings.router)
app.include_router(transfer.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
