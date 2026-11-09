# 家計ダッシュボード3

夫婦の家計を月単位で集計・可視化するWebアプリ。**Cloudflare Workers + D1 で本番稼働中**。

デザインは `DESIGN.md`（PlayStation風デザイントークン + 適用方針）に準拠。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/tech-stack.md](docs/tech-stack.md) | 仕様・設計・技術構成の説明書（GitHub上で読める版） |
| [docs/warikan-integration.md](docs/warikan-integration.md) | 割り勘アプリ連携の仕組みと運用（GitHub上で読める版） |
| `docs/tech-stack.html` / `docs/warikan-integration.html` | 同じ内容のスタイル付きHTML版（ブラウザで開く） |
| `DESIGN.md` | デザイン仕様。UI変更前に必ず読む |
| `CLAUDE.md` | 開発時の作業ガイド |
| `ROLLBACK_warikan.md` | 割り勘連携の戻し方 |

## 系統

| 版 | ディレクトリ | 構成 | 状態 |
|---|---|---|---|
| v1 | `kakei-dashboard` | Streamlit | 初代 |
| v2 | `kakei-dashboard-2` | React + FastAPI（ローカルのみ） | バックアップとして温存 |
| **v3** | **`kakei-dashboard-3`** | **React + Hono/D1（クラウド常時稼働）** | **本番** |

## 構成

```
kakei-dashboard-3/
├── DESIGN.md           # デザイン仕様（フロント実装の基準）
├── frontend/           # React 19 + Vite + TypeScript + Tailwind v4 + Recharts
│   └── src/            # App.tsx / features / charts / components / api / theme
├── worker/             # ★本番バックエンド: Hono on Cloudflare Workers + D1
│   ├── src/            # index.ts(ルーティング) repo.ts aggregate.ts goal.ts
│   │                   # importer.ts exporter.ts dates.ts db.ts
│   ├── migrations/     # D1スキーマ（0001_init / 0002_seed）
│   ├── seed_data.sql   # 初期投入用SQL
│   └── wrangler.toml   # D1バインディング・[assets]・Access設定
├── backend/            # ローカル開発用バックエンド: FastAPI (Python)
│   ├── api/            # routers/ schemas.py deps.py（薄いHTTP変換層）
│   ├── src/            # repo.py aggregate.py goal.py importer.py exporter.py ...
│   ├── data/           # 家計CSV（.gitignore済み＝非公開）
│   ├── migrations/     # 同一スキーマ
│   ├── scripts/        # csv_to_sql.py（ローカルDBへの取込）
│   └── tests/          # pytest
└── 起動.bat            # ローカル起動（FastAPI + Vite を1窓で）
```

## バックエンドが2つある理由（重要）

| | `worker/`（TypeScript） | `backend/`（Python） |
|---|---|---|
| フレームワーク | Hono | FastAPI |
| 実行環境 | Cloudflare Workers | ローカル（uvicorn） |
| DB | 本番D1 `kakei-db` | `backend/local.db`（SQLite） |
| 用途 | **本番稼働** | ローカル開発・テスト |
| 起動 | `npm run dev` / `npm run deploy` | `起動.bat` |

**両者は同じロジックを2言語で対に保っている。** `worker/src/repo.ts` の冒頭に「Python版 `src/repo.py` の移植」と明記されており、API契約（パス・JSON）も同一。

⚠️ **片方だけ直すと本番とローカルで挙動がズレる。必ずセットで編集する。**

| Python | TypeScript |
|---|---|
| `backend/src/repo.py` | `worker/src/repo.ts` |
| `backend/src/aggregate.py` | `worker/src/aggregate.ts` |
| `backend/src/goal.py` | `worker/src/goal.ts` |
| `backend/src/importer.py` / `exporter.py` | `worker/src/importer.ts` / `exporter.ts` |
| `backend/api/routers/*.py` | `worker/src/index.ts` |

> `backend/worker.py` と `backend/wrangler.toml` は Python Workers でデプロイしていた旧経路。現在の本番は `worker/`（TypeScript）side。

## データの正本

**本番D1 (`kakei-db`) が正本。** `backend/data/` のCSVは投入元であり、ローカル開発用のデータソース。
CSVを直しただけでは本番に反映されない（→「月次データ運用フロー」）。

## 起動方法

### ローカル（普段の開発・確認）

`起動.bat` をダブルクリック。FastAPI(:8000) と Vite(:5173) が起動し、ブラウザが自動で開く。

個別に起動する場合:
```bash
cd backend && python -m uvicorn main:app --port 8000
```
```bash
cd frontend && npm install && npm run dev
```

### 本番と同じ構成で動かす（Worker + ローカルD1）

```bash
cd frontend && npm run build
```
```bash
cd worker && npm run dev
```
`wrangler dev` が :8787 で起動。ローカルD1（miniflare）を使うので本番データには影響しない。

### 本番デプロイ

```bash
cd frontend && npm run build
```
```bash
cd worker && npm run deploy
```
フロントは `[assets]` で同じWorkerから配信される単一ホスト名構成。**先に `frontend/dist` をビルドすること。**

本番は **Cloudflare Access** で保護。加えて多層防御として、`ACCESS_ALLOWED_EMAILS` が設定されていれば Worker 側でも `Cf-Access-Authenticated-User-Email` を検証する（`worker/src/index.ts` のミドルウェア）。

## API

`/api/*` のみ Worker が処理し、それ以外は SPA フォールバック。

| エンドポイント | 用途 |
|---|---|
| `GET /api/health` | ヘルスチェック |
| `GET /api/summary` | 全月サマリー・警告 |
| `GET /api/dashboard?month=` | 選択月のKPI + 前月比較 |
| `GET /api/charts?month=` | 円グラフ・棒グラフ・資産推移 |
| `GET/POST /api/entries`, `PUT/DELETE /api/entries/{id}` | 手入力エントリのCRUD |
| `GET/POST /api/bundles/{kind}`, `PUT/DELETE /api/bundles/{kind}/{id}` | サブスク・通信費のCRUD |
| `GET /api/goals`, `GET /api/goals/status` | 目標一覧・達成状況 |
| `POST /api/goals`, `DELETE /api/goals/{name}`, `PUT /api/goals/active` | 目標の追加・削除・切替 |
| `POST /api/months/next` | 翌月作成（固定費・サブスク引き継ぎ） |
| `GET /api/config` | 設定・カテゴリ・使用件数 |
| `PUT /api/config/investment-mode` | 投資を支出に含めるか |
| `POST /api/config/categories` | カテゴリ追加 |
| `DELETE /api/config/categories/{name}` | カテゴリ削除（未使用のみ・保護あり） |
| `POST /api/import/csv?dry_run=` | CSV取込（dry-runで変更前後を確認） |
| `GET /api/export/entries.csv` | 全エントリのCSV書き出し |
| `GET /api/export/bundles/{kind}.csv` | サブスク・通信費のCSV書き出し |

`{kind}` は `subscriptions` / `communications`。

### カテゴリ削除の保護ルール

`DELETE /api/config/categories/{name}` は次の場合400で拒否する（過去集計の破壊を防ぐため）。

- 実績データが1件以上ある
- 収入内訳の集計に使う特別なカテゴリ（夫給与・妻給与）
- サブスク／通信費のバンドルラベル（サブスク・通信費）
- そもそも存在しないカテゴリ

## テスト

```bash
cd backend && python -m pytest -q
```
```bash
cd frontend && npm test && npx tsc -b && npm run lint
```
```bash
cd worker && npm run typecheck
```

## 月次データ運用フロー

会計チェック（`kakei-check` スキル）の Step 5.5 に準拠。

```
backend/data/ にCSVを置く
  → 会計部門が生読みで検証（年月・カテゴリ・金額）
  → レポートに「変更前→変更後＋理由」を提案
  → オーナー承認
  → backend/backup/YYYY-MM-DD/ に原本保全 → CSVに反映 → 再検証
  → CSV→INSERT SQL変換
  → npx wrangler d1 execute kakei-db --remote --file=<生成したsql>
  → 件数・合計を再クエリして期待値と一致を確認
```

アプリの設定タブにもCSV取込があるが、**月次一式の投入には使えない**（`source='import'` 固定で後から編集不可・`bundle_items` 非対応・新カテゴリ登録不可）。数行の臨時追加用。

### D1の確認・修復

```bash
npx wrangler d1 execute kakei-db --remote --command "SELECT month, COUNT(*), SUM(amount) FROM entries GROUP BY month ORDER BY month"
```

`--remote`（本番）と `--local`（開発）を取り違えないこと。削除は必ず `WHERE month IN (...)` で範囲を限定する。

## 公開リポジトリでの注意

`.gitignore` で以下を除外している。

- `backend/data/` — 家賃・NISA金額などの家計実データ
- `backend/backup/` — 反映前の原本
- `*.db` / `*.sqlite` / `.wrangler/` — ローカルDB・実行時データ

clone した場合 `backend/data/` は空になるので、自分のCSV（`年月,カテゴリ,金額` の3列）を置いて使う。
