"""Cloudflare Python Workers エントリポイント。

ローカルでは使わない（uvicorn は `main:app` を直接起動する）。Workers ランタイムが
`workers` / `asgi` モジュールを提供する。`asgi.fetch` が env を ASGI scope に載せ、
`api.deps.get_db` が `scope['env']` を見て D1 に切り替える（無ければローカル SQLite）。

同一ホスト名構成: `/api/*` は wrangler.toml の run_worker_first でこの Worker が処理し、
それ以外のパスは [assets]（frontend/dist）が SPA フォールバックで配信する。
"""

from workers import WorkerEntrypoint
import asgi

from main import app


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        # env を ASGI scope に注入して FastAPI(app) を実行する
        return await asgi.fetch(app, request, self.env)
