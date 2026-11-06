# CLAUDE.md

全て日本語で

このファイルは、このリポジトリで作業する Claude Code (claude.ai/code) へのガイダンスを提供する。

## プロジェクト概要

家計ダッシュボード3 (Household Budget Dashboard v3) — 夫婦の家計を月単位で管理するダッシュボード。React フロントエンド + **2つの言語で二重実装されたバックエンド**で構成され、本番は Cloudflare Workers + D1 上で稼働する。

## 最重要のアーキテクチャ事実: バックエンドが2系統ある

このリポジトリには**同一ロジックの独立した2つのバックエンド実装**があり、常に同期を保つ必要がある。

| | `worker/`（TypeScript） | `backend/`（Python） |
|---|---|---|
| フレームワーク | Hono | FastAPI |
| 実行環境 | Cloudflare Workers | ローカルのみ（uvicorn） |
| DB | 本番D1（`kakei-db`） | `backend/local.db`（SQLite） |
| 役割 | **本番稼働** | ローカル開発・テスト用サンドボックス |

`worker/src/repo.ts` は明示的に `backend/src/repo.py` の移植であり、API契約（パス・JSONの形）は両者で同一。**不具合修正や挙動変更を行う際は両方を編集すること** — 対応関係は以下の通り：

| Python | TypeScript |
|---|---|
| `backend/src/repo.py` | `worker/src/repo.ts` |
| `backend/src/aggregate.py` | `worker/src/aggregate.ts` |
| `backend/src/goal.py` | `worker/src/goal.ts` |
| `backend/src/importer.py` / `exporter.py` | `worker/src/importer.ts` / `exporter.ts` |
| `backend/src/dates.py` | `worker/src/dates.ts` |
| `backend/api/routers/*.py` | `worker/src/index.ts`（全ルートが1ファイルに集約） |

`backend/worker.py` と `backend/wrangler.toml` は、廃止された Python Workers デプロイ経路の名残 — 現在は未使用。明示的に依頼されない限り触らないこと。

### 二重実装の例外: 割り勘アプリ連携

**割り勘アプリ（`C:\Users\barub\Project\warikan`）への反映機能は `worker/` にしか存在しない。** Cloudflare の Service Binding（Worker→Worker の直接呼び出し）を使うため、FastAPI では原理的に実装できない。該当は以下で、`backend/` に対応物を作らないこと。

- `worker/src/warikan.ts`（連携クライアント）、`worker/src/errors.ts`
- `worker/src/index.ts` の `GET /api/warikan/status`、`GET /api/warikan/users`、`POST /api/entries/{id}/warikan`、`DELETE /api/entries/{id}/warikan`

ただし **`entries.warikan_expense_id` 列と `/api/entries` のJSONの形は両系統で同期する**（マイグレーション `0005_add_entry_warikan_id.sql` は worker/backend 両方にあり、`割り勘ID` キーも両方が返す）。ローカルFastAPIで開発すると `/api/warikan/status` が404になり、フロントは連携無効として扱って反映ボタンを出さない（正常動作）。

連携は Service Binding（`worker/wrangler.toml` の `[[services]]`）と共有シークレット `WARIKAN_INTERNAL_TOKEN` の両方が揃って初めて有効になる。どちらかを外せば画面から反映UIが消えて連携前の挙動に戻る（キルスイッチ）。戻し方の全手順は `ROLLBACK_warikan.md` を参照。

本番データの正本は D1（`kakei-db`）であり、`backend/data/` のCSVではない。CSVを直しただけでは本番には反映されない。

## コマンド

### ローカル開発（FastAPI + Vite、通常の開発作業）
```bash
cd backend && python -m uvicorn main:app --port 8000
```
```bash
cd frontend && npm install && npm run dev
```
または `起動.bat` をダブルクリックすると両方まとめて起動する。

### 本番相当のスタック（Worker + ローカルD1）
```bash
cd frontend && npm run build
cd worker && npm run dev
```
`wrangler dev` は :8787 で起動し、ローカルの miniflare D1 を使用する（本番には影響しない）。

### デプロイ
```bash
cd frontend && npm run build
cd worker && npm run deploy
```
必ず先にフロントエンドをビルドすること — Worker は `[assets]` を通じて `frontend/dist` を `/api/*` と同じホストから配信する。

### テスト / 型チェック / lint
```bash
cd backend && python -m pytest -q
cd backend && python -m pytest tests/test_dates.py -q          # 単一ファイル
cd backend && python -m pytest tests/test_dates.py::test_name -q  # 単一テスト
```
```bash
cd frontend && npm test              # vitest run
cd frontend && npm run test:watch    # vitest watchモード
cd frontend && npx vitest run src/features/entry/EntryTab.test.tsx  # 単一ファイル
cd frontend && npx tsc -b
cd frontend && npm run lint          # oxlint
```
```bash
cd worker && npm test                # vitest run
cd worker && npm run typecheck       # tsc --noEmit（src + tests）
```

全体を一括で実行する単一のトップレベルコマンドは存在しない — `backend/` `frontend/` `worker/` はそれぞれ独立してテストする。

## APIサーフェス（`/api/*` は Worker が処理、それ以外はSPAフォールバック）

- `GET /api/health`
- `GET /api/summary` — 全月サマリー・警告
- `GET /api/dashboard?month=` — 選択月のKPI + 前月比較
- `GET /api/charts?month=` — 円グラフ・棒グラフ・資産推移データ
- `GET/POST /api/entries`, `PUT/DELETE /api/entries/{id}` — 手入力エントリのCRUD
- `GET/POST /api/bundles/{kind}`, `PUT/DELETE /api/bundles/{kind}/{id}` — サブスク・通信費バンドルのCRUD（`{kind}` は `subscriptions` | `communications`）
- `GET /api/goals`, `GET /api/goals/status`, `POST /api/goals`, `DELETE /api/goals/{name}`, `PUT /api/goals/active`
- `POST /api/months/next` — 翌月作成（固定費・サブスクを引き継ぐ）
- `GET /api/config`, `PUT /api/config/investment-mode`, `POST /api/config/categories`, `DELETE /api/config/categories/{name}`
- `GET /api/warikan/status` — 割り勘連携が有効か（**Worker専用**。フロントは false なら反映UIを出さない）
- `GET /api/warikan/users` — 割り勘アプリの支払者候補（**Worker専用**）
- `POST /api/entries/{id}/warikan`, `DELETE /api/entries/{id}/warikan` — 割り勘への反映／取り消し（**Worker専用**）
- `POST /api/import/csv?dry_run=` — CSV取込（dry-runでプレビュー可能）
- `GET /api/export/entries.csv`, `GET /api/export/bundles/{kind}.csv`

**カテゴリ削除の保護ルール**: `DELETE /api/config/categories/{name}` は次の場合に400を返す（両バックエンドでロジックを同期させること） — 実績データが1件以上ある／収入内訳の特別カテゴリ（夫給与・妻給与）である／バンドルラベル（サブスク・通信費）である／そもそも存在しない。過去集計の破壊を防ぐための保護。

**CSV取込の注意点**: アプリ内（設定タブ）のCSV取込は少量の臨時追加専用 — `source='import'` 固定で後から編集不可、`bundle_items` 非対応、新カテゴリ登録不可。月次一式の投入は下記の手動SQLフローを使う。

## 月次データ運用フロー（実際の家計データ。テスト用フィクスチャではない）

1. `backend/data/` にCSVを置く
2. 生データで検証（年月・カテゴリ・金額）
3. 「変更前→変更後＋理由」の差分を提案
4. オーナーの承認を得る
5. `backend/backup/YYYY-MM-DD/` に原本を保全してからCSVに反映、再検証
6. CSV→INSERT SQLに変換（`backend/scripts/csv_to_sql.py`）
7. `npx wrangler d1 execute kakei-db --remote --file=<生成したsql>`
8. 件数・合計を再クエリして期待値と一致することを確認

D1の確認コマンド:
```bash
npx wrangler d1 execute kakei-db --remote --command "SELECT month, COUNT(*), SUM(amount) FROM entries GROUP BY month ORDER BY month"
```
`--remote`（本番）と `--local`（開発）を必ず取り違えないこと。削除は必ず `WHERE month IN (...)` で範囲を限定する。

## 本番環境の認証

本番は Cloudflare Access で保護されている。多層防御として、`ACCESS_ALLOWED_EMAILS` が設定されていれば Worker 側でも `Cf-Access-Authenticated-User-Email` ヘッダーを検証する（`worker/src/index.ts` のミドルウェア）。

## ディレクトリ構成

```
frontend/src/
  App.tsx               # タブのシェル（Dashboard / Charts / Entry / Goal / Settings）
  features/<tab>/        # タブごとのディレクトリ、機能単位のコンポーネント
  charts/                 # Recharts のラッパー（ExpensePie, GroupBar, AssetTrendLine, SavingsBar）
  components/             # デザインシステムのプリミティブ（Band, Button, ProductCard, Nav 等）
  api/                    # client.ts（fetchラッパー）+ types.ts（APIレスポンスの型）
  theme/                  # tokens.ts + global.css（DESIGN.md由来のデザイントークン）

worker/src/
  index.ts                # Honoのルート全部 + Access認証ミドルウェア
  repo.ts / aggregate.ts / goal.ts / importer.ts / exporter.ts / dates.ts / db.ts

backend/
  api/routers/*.py        # 薄いFastAPIのHTTP層、リソースごとに1ルーター
  api/schemas.py           # Pydanticのリクエスト/レスポンスモデル
  src/                     # worker/src と同名のモジュール群。ビジネスロジック本体
```

## フロントエンドのデザインシステム

見た目のデザインは `DESIGN.md`（PlayStationのマーケティングサイトから抽出したトークン体系: 色・タイポグラフィ・余白・コンポーネント仕様）に準拠しており、末尾の「Application to 家計簿ダッシュボード2」セクションでこのアプリ固有のマッピングを定義している（タブ＝フルブリードのバンド、KPIには `product-card`、Goalタブには `hero-band-blue`、このアプリには commerce/orangeのCTAは存在しない、など）。フォント代替: 見出し系はRoboto Light 300、本文/UI要素はInter 400/500/600（PlayStation SSTは非公開フォントのため使用不可）。UI変更を行う前に必ず `DESIGN.md` を読むこと — これは単なる参考ではなく正式な仕様である。

## データのプライバシー

`.gitignore` で `backend/data/`（家賃・投資額などの実データ）、`backend/backup/`、`*.db`/`*.sqlite`/`.wrangler/` を除外している。cloneした直後は `backend/data/` が空になるため、ローカル開発では自分のCSV（`年月,カテゴリ,金額` の3列）を用意すること。
