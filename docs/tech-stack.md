# 家計ダッシュボード3 — 仕様・設計・技術構成

> HTML版: [tech-stack.html](tech-stack.html)（同じ内容をスタイル付きで読める）
> 姉妹編: [割り勘アプリ連携 — 仕組みと運用](warikan-integration.md)

夫婦の家計を月単位で集計・可視化するWebアプリ。Cloudflare Workers 上で API と SPA を1つの Worker から配信し、データは D1 に置く。同じロジックが TypeScript と Python の2言語で二重に実装されているのが最大の特徴。

`TypeScript 5.7 / 6.0` `Python 3.12+` `React 19` `Hono 4` `FastAPI` `Vite 8` `Tailwind CSS 4` `Recharts 3` `Cloudflare Workers + D1`

## 目次

1. [このアプリは何をするものか](#1-このアプリは何をするものか)
2. [最重要の構造 — バックエンドが2系統ある](#2-最重要の構造--バックエンドが2系統ある)
3. [使用している言語](#3-使用している言語)
4. [フォルダ構成](#4-フォルダ構成)
5. [データベース（Cloudflare D1）](#5-データベースcloudflare-d1)
6. [集計ロジック](#6-集計ロジック)
7. [API エンドポイント](#7-api-エンドポイント)
8. [フロントエンド構成](#8-フロントエンド構成)
9. [ライブラリとフレームワーク](#9-ライブラリとフレームワーク)
10. [ツール・実行環境・コマンド](#10-ツール実行環境コマンド)
11. [テスト](#11-テスト)
12. [設計上の制約と運用ルール](#12-設計上の制約と運用ルール)

---

## 1. このアプリは何をするものか

夫婦2人の家計を **月（`YYYY-MM`）単位** で記録し、KPI・グラフ・貯蓄目標として見せる。データの最小単位は「ある月の、あるカテゴリに、いくら使ったか」の1行。

### ダッシュボード — `features/dashboard/Dashboard.tsx`

選択した月の KPI（収入・支出・貯金・純資産など）と前月比較。

- 数値は必ず product-card の中に置く
- 前月が無い月は比較を出さない

### グラフ — `features/charts/ChartsTab.tsx`

支出の円グラフ、グループ別の棒グラフ（当月／前月）、資産推移の折れ線、貯金額の棒。

- Recharts。重いので動的 import で分割

### 入力 — `features/entry/EntryTab.tsx`

9つのサブタブ（変動費・収入・固定費・インフラ・通信費・サブスク・車・バイク・投資）でのCRUD。アプリを開いた直後の既定タブ。

- 変動費・車・バイク・投資は「日」も任意入力できる
- 通信費・サブスクだけは別テーブル（`bundle_items`）
- 割り勘アプリへの反映ボタンもここ

### 目標 — `features/goal/GoalTab.tsx`

貯蓄目標の登録と達成状況。直近6か月のペースから達成予想月を出す。

### 設定 — `features/settings/SettingsTab.tsx`

カテゴリの追加・削除、投資の扱い（支出に含めるか）、CSV取込・書き出し、翌月シートの作成、月の削除。

> **月が主役で、日は脇役**
> 集計・グラフ・目標はすべて月単位。`entries.day` は後から足した任意項目で、一覧の並べ替えと割り勘アプリへの反映にしか使わない。日が無いエントリがあっても集計は壊れない。

---

## 2. 最重要の構造 — バックエンドが2系統ある

このリポジトリには**同一ロジックの独立した2実装**がある。片方だけ直すとAPIの挙動がずれるため、常に同期させる。

| | `worker/`（TypeScript） | `backend/`（Python） |
|---|---|---|
| フレームワーク | Hono 4 | FastAPI |
| 実行環境 | Cloudflare Workers | ローカルのみ（uvicorn） |
| DB | 本番 D1（`kakei-db`） | `backend/local.db`（SQLite） |
| 役割 | **本番稼働** | ローカル開発・テスト用サンドボックス |
| テスト | vitest（3ファイル） | pytest（15ファイル） |

### 2-1. モジュールの対応

| Python | TypeScript | 役割 |
|---|---|---|
| `backend/src/repo.py` | `worker/src/repo.ts` | 全SQLアクセス。検証もここ |
| `backend/src/aggregate.py` | `worker/src/aggregate.ts` | 月次集計・KPI・前月比較 |
| `backend/src/goal.py` | `worker/src/goal.ts` | 目標の達成率と達成予想月 |
| `backend/src/importer.py` / `exporter.py` | `worker/src/importer.ts` / `exporter.ts` | CSV取込・書き出し |
| `backend/src/dates.py` | `worker/src/dates.ts` | 年月の正規化・加算・末日 |
| `backend/api/routers/*.py` | `worker/src/index.ts` | HTTP層。TS版は全ルートが1ファイル |

`worker/src/repo.ts` のコメントに「Python版 `src/repo.py` の移植」と明記されている。API契約（パス・JSONの形）は両者で完全に同一。

### 2-2. 唯一の例外 — 割り勘アプリ連携

Cloudflare の Service Binding（Worker→Worker の直接呼び出し）を使うため、FastAPI では原理的に実装できない。以下は `worker/` にしか存在しない。

- `worker/src/warikan.ts`（連携クライアント）、`worker/src/errors.ts`
- `GET /api/warikan/status`、`GET /api/warikan/users`、`POST /api/entries/{id}/warikan`、`DELETE /api/entries/{id}/warikan`

ただし `entries.warikan_expense_id` 列と `/api/entries` のJSONの形（`割り勘ID` キー）は両系統で同期している。詳細は [割り勘アプリ連携の説明書](warikan-integration.md)。

> **なぜ2つあるのか**
> もともと Python（FastAPI）版だけだった。本番を Cloudflare Workers に載せる際、当時の Python Workers では実用に耐えなかったため TypeScript に移植した。Python版はローカルで素早く試すためのサンドボックスとして残っている。`backend/worker.py` と `backend/wrangler.toml` は廃止された Python Workers デプロイ経路の名残で、現在は未使用。

---

## 3. 使用している言語

| 言語 | 使用箇所 | 備考 |
|---|---|---|
| **TypeScript** | `worker/src`（本番API）、`frontend/src` | worker は TS 5.7、frontend は TS 6.0。どちらも `tsc` は型検査専用（`noEmit` / `tsc -b`）でビルドは Vite・wrangler が行う |
| **TSX (JSX)** | `frontend/src` の React コンポーネント | React 19 の自動 JSX ランタイム |
| **Python** | `backend/`（ローカル開発用API） | 3.12 以上。実行時依存は fastapi と pydantic だけ（pandas・numpy・yaml は使わない） |
| **SQL** | `worker/migrations/*.sql`、`backend/migrations/*.sql` | SQLite 方言。金額はすべて `INTEGER`（円）。2つのディレクトリの中身は同一 |
| **CSS** | `frontend/src/theme/global.css`、`index.css` | Tailwind CSS 4 のCSS-first設定（`@theme`）。デザイントークンは `theme/tokens.ts` と二重管理 |
| **HTML** | `frontend/index.html` | Vite のエントリ。PWA の manifest とアイコンを参照 |

---

## 4. フォルダ構成

```
kakei-dashboard-3/
├── CLAUDE.md               # 開発者（と Claude Code）向けの作業ガイド
├── DESIGN.md               # デザイン仕様。UI変更前に必ず読む正式な仕様書
├── README.md               # 概要と v1/v2/v3 の系統
├── ROLLBACK_warikan.md     # 割り勘連携の戻し方（段階1〜4）
├── 起動.bat                # FastAPI と Vite をまとめて起動
│
├── docs/                   # このドキュメント群
│   ├── docs.css
│   ├── tech-stack.html / tech-stack.md
│   └── warikan-integration.html / warikan-integration.md
│
├── frontend/               # React 19 + Vite 8 + Tailwind 4
│   ├── index.html
│   ├── tailwind.config.ts  # tokens.ts をTailwindのテーマに写したもの
│   ├── vite.config.ts      # vitest(jsdom)の設定も兼ねる
│   ├── public/             # PWA manifest とアイコン
│   └── src/
│       ├── App.tsx         # タブのシェル（5タブ）＋月セレクタ
│       ├── features/       # タブごと。dashboard / charts / entry / goal / settings
│       ├── charts/         # Recharts ラッパー4種＋配色
│       ├── components/     # デザインシステムのプリミティブ
│       ├── api/            # client.ts（fetchラッパー）/ types.ts
│       ├── hooks/          # useApiResource
│       ├── theme/          # tokens.ts / global.css
│       └── utils/          # currency / dates / expenseSummary
│
├── worker/                 # ★本番バックエンド（Hono on Workers）
│   ├── wrangler.toml       # D1バインディング / [assets] / Service Binding
│   ├── migrations/         # 0001_init 〜 0005_add_entry_warikan_id
│   ├── src/
│   │   ├── index.ts        # 全ルート（32本）＋ Access ガード
│   │   ├── repo.ts         # 全SQLアクセス（723行）
│   │   ├── aggregate.ts    # 月次集計
│   │   ├── goal.ts         # 目標
│   │   ├── importer.ts / exporter.ts
│   │   ├── dates.ts / db.ts / errors.ts
│   │   └── warikan.ts      # 割り勘アプリ連携クライアント
│   └── tests/              # node:sqlite に実マイグレーションを当てて repo を直接検証
│
└── backend/                # ローカル開発用バックエンド（FastAPI）
    ├── main.py
    ├── api/                # routers/*.py（薄いHTTP層）/ schemas.py / deps.py
    ├── src/                # worker/src と同名のモジュール群
    ├── migrations/         # worker/migrations と同一内容
    ├── tests/              # pytest 15ファイル
    ├── scripts/            # csv_to_sql.py（月次データ投入用）
    ├── data/               # gitignore（実データのCSV）
    └── backup/             # gitignore（原本・DBエクスポート）
```

> **gitignore されているもの**
> `backend/data/`（家賃・投資額などの実データ）、`backend/backup/`、`*.db` / `*.sqlite`、`.wrangler/`、`.dev.vars`、`frontend/dist`。clone 直後は `backend/data/` が空になるので、ローカル開発では自分でCSV（`年月,カテゴリ,金額` の3列）を用意する。

---

## 5. データベース（Cloudflare D1）

本番は D1 の `kakei-db`（binding は `DB`）。**正本はD1であって `backend/data/` のCSVではない** — CSVを直しただけでは本番に反映されない。

### 5-1. テーブル

| テーブル | 主なカラム | 役割 |
|---|---|---|
| `entries` | `id, month, category, amount, source, created_at, note, day, warikan_expense_id` | 家計の1行。`month` は `GLOB` で `YYYY-MM` を強制、`amount > 0`。`source` は `manual` か `import` で、編集できるのは manual だけ |
| `bundle_items` | `id, kind, month, name, amount` | サブスク・通信費の内訳。`kind` は `subscriptions`/`communications`。`(kind, month, name)` が UNIQUE。集計時は1カテゴリに畳まれる |
| `category_groups` | `name, sort_order` | 8グループ（収入・固定費・インフラ・通信費・変動費・車・バイク・投資）。入力タブのサブタブ名と一致する |
| `categories` | `name, group_name, income_owner, sort_order` | 30カテゴリ。`income_owner` は夫／妻で、収入の内訳表示に使う |
| `goals` | `name, target_amount, source, sort_order` | 貯蓄目標。`source` は `savings`（累計貯金）か `net_worth`（純資産） |
| `app_settings` | `key, value` | 今は `investment_as_expense` と `active_goal` だけ |
| `dashboard_months` | `month` | データが0件でも月セレクタに出したい月。翌月シート作成で使う |

### 5-2. マイグレーション

| ファイル | 内容 |
|---|---|
| `0001_init.sql` | 7テーブルの作成 |
| `0002_seed.sql` | 8グループ・30カテゴリ・初期設定の投入 |
| `0003_add_entry_note.sql` | `entries.note`（詳細）。空欄は許すが NULL は使わない方針で `NOT NULL DEFAULT ''` |
| `0004_add_entry_day.sql` | `entries.day`（日）。NULL = 日付なし。月末日との整合はDBではなくアプリ側で検証 |
| `0005_add_entry_warikan_id.sql` | `entries.warikan_expense_id`。割り勘アプリへの反映先ID。NULL = 未反映 |

`worker/migrations/` と `backend/migrations/` は**バイト単位で同一**。worker のテストは `node:sqlite` のインメモリDBにこのSQLを実際に適用して走るので、本番と同じスキーマで検証される。

> ⚠️ **`--remote` と `--local` を取り違えない**
> `npx wrangler d1 execute kakei-db --remote` は本番、`--local` は開発用。削除は必ず `WHERE month IN (...)` で範囲を限定する。

---

## 6. 集計ロジック

### 6-1. 月次サマリー（`monthlySummary`）

すべてのエントリを月ごとに畳んで、1行 = 1か月の表を作る。ダッシュボード・グラフ・目標はすべてこの表から導かれる。

| 列 | 意味 |
|---|---|
| `収入` | グループ「収入」の合計 |
| `夫収入` / `妻収入` | `categories.income_owner` で振り分けた内訳 |
| `支出` | 収入以外の合計。`investment_as_expense` が false なら投資を除く |
| `投資` | グループ「投資」の合計 |
| `貯金` | 収入 − 支出 |
| `累計貯金` | 貯金の累積 |
| `投資累計` | 投資の累積 |
| `純資産` | 累計貯金 + 投資累計 |

`investment_as_expense`（設定タブで切替）が、投資を「支出」に数えるかどうかを決める。これにより「貯金」の意味が変わるため、グラフも目標も一斉に変わる。

### 6-2. 目標（`goalStatus`）

1. **現在額を取る** — 目標の `source` が `net_worth` なら最新月の `純資産`、そうでなければ `累計貯金`。
2. **達成率と残額** — 達成率は 0〜100% にクランプ。残額は負にならない。
3. **ペースを出す** — **直近6か月**（`PACE_WINDOW_MONTHS`）の月次の積み増し（貯金、純資産目標なら 貯金+投資）の平均。
4. **達成予想月** — 残額 ÷ ペースを切り上げた月数を最新月に足す。ペースが0以下なら `null`（予想不能）。

### 6-3. 年月の正規化（`dates.normalizeMonth`）

CSV取込で人間が書いた表記を吸収する。空欄なら今月、`1`〜`12` の数字だけなら今年のその月、`2026年6月` / `2026/6` / `2026-6` はすべて `2026-06` になる。解釈できなければ例外。

---

## 7. API エンドポイント

`/api/*` は Worker（Hono）が処理し、それ以外は `[assets]` が SPA を返す（`run_worker_first = ["/api/*"]`）。エラーは FastAPI 互換の `{"detail": "..."}` で返す。

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/health` | 疎通確認 |
| GET | `/api/summary` | 全月サマリー・警告・当月 |
| GET | `/api/dashboard?month=` | 選択月のKPIと前月比較 |
| GET | `/api/charts?month=` | 円グラフ・棒グラフ・資産推移のデータ |
| GET | `/api/entries?month=&group=` | 手入力エントリ一覧（`source='manual'` のみ） |
| POST | `/api/entries` | 追加。レスポンスは更新後の全件配列 |
| PUT | `/api/entries/{id}` | 更新。`day` は未送信＝触らない／`null`＝クリア |
| DELETE | `/api/entries/{id}` | 削除。割り勘に反映済みなら409 |
| GET | `/api/warikan/status` | 割り勘連携が有効か（**Worker専用**） |
| GET | `/api/warikan/users` | 支払者の候補（**Worker専用**） |
| POST | `/api/entries/{id}/warikan` | 割り勘へ反映（**Worker専用**） |
| DELETE | `/api/entries/{id}/warikan` | 反映の取り消し（**Worker専用**） |
| GET | `/api/bundles/{kind}` | サブスク／通信費の内訳 |
| POST | `/api/bundles/{kind}` | 内訳の追加 |
| PUT | `/api/bundles/{kind}/{id}` | 内訳の更新 |
| DELETE | `/api/bundles/{kind}/{id}` | 内訳の削除 |
| GET | `/api/goals` / `/api/goals/status` | 目標の一覧／達成状況 |
| POST | `/api/goals` | 目標の追加 |
| DELETE | `/api/goals/{name}` | 目標の削除 |
| PUT | `/api/goals/active` | 表示する目標の切替 |
| POST | `/api/months/next` | 翌月シート作成（固定費・サブスクを引き継ぐ） |
| POST | `/api/months/ensure-current` | 当月シートが無ければ作る（アプリ起動時に自動） |
| DELETE | `/api/months/{month}` | 月まるごと削除 |
| GET | `/api/config` | カテゴリ・設定・使用件数 |
| PUT | `/api/config/investment-mode` | 投資を支出に含めるかの切替 |
| POST | `/api/config/categories` | カテゴリ追加 |
| DELETE | `/api/config/categories/{name}` | カテゴリ削除（保護あり・後述） |
| POST | `/api/import/csv?dry_run=` | CSV取込（dry-runでプレビュー） |
| GET | `/api/export/entries.csv` | エントリのCSV書き出し |
| GET | `/api/export/bundles/{kind}.csv` | 内訳のCSV書き出し |

> **レスポンスの約束**
> エントリとバンドルの変更系（POST/PUT/DELETE）は、**更新後の全件配列**を返す。ただしフロントは絞り込み条件（月・グループ）を知っているので、戻り値をそのまま画面に出さず `GET` で取り直す。この約束を破ると、変動費タブに家賃が混ざるようなバグになる。

### 認証

本番は Cloudflare Access で保護されている。多層防御として、`ACCESS_ALLOWED_EMAILS` が設定されていれば Worker 側でも `Cf-Access-Authenticated-User-Email` ヘッダを許可リストと突き合わせる（`worker/src/index.ts` のミドルウェア）。未設定なら素通し＝ローカル開発用。

---

## 8. フロントエンド構成

### 8-1. 画面の骨格

`App.tsx` がタブのシェル。5タブ（ダッシュボード／グラフ／入力／目標／設定）＋月セレクタ。デスクトップは上部ナビ、スマホは下部固定タブバー（`z-50`）。既定タブは**入力**（最も使う画面のため）。

### 8-2. デザインシステム

`DESIGN.md`（PlayStationのマーケティングサイトから抽出したトークン体系）に準拠する。**参考ではなく正式な仕様**で、UI変更の前に必ず読む。

| 決まり | 内容 |
|---|---|
| タブ＝バンド | 各タブはフルブリードのバンドを縦に積む（ダーク／ライト交互） |
| KPI | 裸の数字は置かず、必ず `product-card`（8px角丸）の中に入れる |
| 目標タブ | `hero-band-blue` を主コンテナに使う（「達成の瞬間」の表現） |
| CTA | すべて `button-primary` のピル。このアプリに commerce（オレンジ）CTAは存在しない |
| フォント | 見出しは Roboto Light 300、本文・UIは Inter 400/500/600（PlayStation SST は非公開のため代替） |
| グラフ配色 | 元の仕様に無いので新規定義。`#0070d1` を基調に、`warning` の赤は「予算超過」専用で中立カテゴリには使わない |

トークンは `src/theme/tokens.ts`（JSの生値用）と `tailwind.config.ts`（ユーティリティクラス用）に二重管理されている。**片方だけ変えない。**

### 8-3. 主なコンポーネント

**`components/`** — `frontend/src/components/`

Badge / Band / Button / Container / FilterPill / Footer / Metric / **Modal** / MonthSelector / Nav / ProductCard / SectionTitle / TextInput

- `Button` に `disabled` prop は無い。`variant="disabled"` で表す
- `Modal` は割り勘連携で追加した唯一のモーダル。`z-[60]` でスマホ下部タブバーの上に出す

**`charts/`** — `frontend/src/charts/`

ExpensePie / GroupBar / AssetTrendLine / SavingsBar と配色（categoryColors・chartTheme）。Recharts のラッパー。

**`api/`** — `frontend/src/api/`

`client.ts` は素の `fetch` ラッパー2本（`getJson` / `mutateJson`）だけ。baseURL も認証ヘッダも持たない（同一ホスト・相対パス）。

- エラーは `{detail}` を取り出して `ApiError` に
- `types.ts` のキーは日本語（`年月`・`カテゴリ`・`金額`・`備考`・`日`・`割り勘ID`）

**`features/entry/`** — `frontend/src/features/entry/`

最も複雑なタブ。`EntryTab.tsx` にサブタブの挙動スイッチ（どのタブで日を出すか・並べ替えを出すか等）が定数として集約されている。

- `entryParts.tsx` — DaySelect・並べ替え・合計
- `useFormAutoScroll.ts` — スマホでフォームを画面中央へ
- `WarikanDialog.tsx` — 割り勘反映のポップアップ

---

## 9. ライブラリとフレームワーク

### ランタイム依存（本番のコードに入るもの）

| パッケージ | 版 | どこで | 役割 |
|---|---|---|---|
| `hono` | ^4.6.14 | worker | Workers向けの軽量ルーター。ルーティング・ミドルウェア・エラーハンドリング |
| `react` / `react-dom` | ^19.2.7 | frontend | UI。状態管理ライブラリは入れていない（useState と小さな自作フックのみ） |
| `recharts` | ^3.9.0 | frontend | グラフ。バンドルが大きいのでグラフタブは動的 import で分割 |
| `@fontsource/inter` / `@fontsource/roboto` | ^5.3.0 | frontend | フォントのセルフホスト（外部CDNに依存しない） |
| `fastapi` | — | backend | ローカル開発用API |
| `pydantic` | — | backend | リクエスト／レスポンスの検証 |

### 開発・テスト用の依存

| パッケージ | 版 | 役割 |
|---|---|---|
| `vite` | ^8.1.0 | フロントのビルドと開発サーバー |
| `@vitejs/plugin-react` | ^6.0.2 | React の HMR と JSX 変換 |
| `tailwindcss` / `@tailwindcss/vite` | ^4.3.1 | CSS。v4 はCSS-first設定で `global.css` の `@theme` が本体 |
| `vitest` | ^4.1.9（frontend） / ^2.1.8（worker） | テストランナー。frontend は jsdom 環境 |
| `@testing-library/react` / `jest-dom` | ^16.3.2 / ^6.9.1 | コンポーネントテスト。実装詳細でなく画面の見え方で検証する |
| `@vitest/coverage-v8` | ^4.1.9 | カバレッジ |
| `oxlint` | ^1.69.0 | Rust製の高速リンター（ESLintの代わり） |
| `typescript` | ~6.0.2 / ~5.7.2 | 型検査のみ。ビルドはしない |
| `wrangler` | ^4.0.0 | Workers のローカル実行・デプロイ・D1操作・シークレット管理 |
| `@cloudflare/workers-types` | ^5.x | `D1Database` / `Fetcher` などの型 |
| `pytest` / `httpx` / `uvicorn` | — | Python側のテストと開発サーバー |

> **入れていないもの**
> 状態管理（Redux・Zustand・TanStack Query）、ORM、UIコンポーネントライブラリ、日付ライブラリ。どれも「2人で使う家計簿」には重いと判断し、素の React と小さな自作ユーティリティで済ませている。日付処理は `dates.ts` / `utils/dates.ts` の自前実装。

---

## 10. ツール・実行環境・コマンド

**全体を一括で実行するトップレベルのコマンドは無い。** `backend/` `frontend/` `worker/` はそれぞれ独立してテストする。

### ローカル開発（FastAPI + Vite）

```bash
cd backend && python -m uvicorn main:app --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

または `起動.bat` をダブルクリックで両方起動。この構成では割り勘連携は使えない（Worker専用のため `/api/warikan/status` が404になり、反映ボタンは出ない）。

### 本番相当のスタック（Worker + ローカルD1）

```bash
cd frontend && npm run build
```

```bash
cd worker && npm run dev
```

`wrangler dev` は :8787 で起動し、ローカルの miniflare D1 を使う（本番には影響しない）。

### デプロイ

```bash
cd frontend && npm run build
```

```bash
cd worker && npm run deploy
```

> ⚠️ **必ず先にフロントをビルドする**
> Worker は `[assets]` で `frontend/dist` を `/api/*` と同じホストから配信する。ビルドを忘れると古い画面がデプロイされる。

### テスト・型検査・lint

```bash
cd backend && python -m pytest -q
```

```bash
cd backend && python -m pytest tests/test_dates.py::test_name -q
```

```bash
cd frontend && npm test
```

```bash
cd frontend && npm run test:watch
```

```bash
cd frontend && npx vitest run src/features/entry/EntryTab.test.tsx
```

```bash
cd frontend && npx tsc -b
```

```bash
cd frontend && npm run lint
```

```bash
cd worker && npm test
```

```bash
cd worker && npm run typecheck
```

### D1 の確認

```bash
npx wrangler d1 execute kakei-db --remote --command "SELECT month, COUNT(*), SUM(amount) FROM entries GROUP BY month ORDER BY month"
```

```bash
npx wrangler d1 export kakei-db --remote --output backup.sql
```

---

## 11. テスト

| 対象 | フレームワーク | ファイル数 | 方針 |
|---|---|---|---|
| `worker/` | vitest | 3 | `tests/testDb.ts` が `node:sqlite` のインメモリDBに `migrations/*.sql` を実際に適用する。HTTPは通さず repo 関数を直接呼ぶ |
| `frontend/` | vitest + Testing Library | 27 | jsdom。`vi.mock` でAPIをモックし、呼び出し引数と画面表示の両方をアサートする |
| `backend/` | pytest | 15 | インメモリDBの `client` フィクスチャ経由でHTTPレベルの検証 |

`worker/tests/repo.entries.test.ts` と `backend/tests/test_api_entries.py` は**同じシナリオを意図的にミラーしている**。片方を足したらもう片方も足す。

---

## 12. 設計上の制約と運用ルール

### 12-1. カテゴリ削除の保護

`DELETE /api/config/categories/{name}` は次の場合に400を返す。過去の集計を壊さないための保護で、**両バックエンドでロジックを同期させる**。

- 実績データが1件以上ある
- 収入内訳の特別カテゴリ（夫給与・妻給与）である
- バンドルラベル（サブスク・通信費）である
- そもそも存在しない

### 12-2. CSV取込の制限

アプリ内（設定タブ）の取込は**少量の臨時追加専用**。`source='import'` 固定で後から編集できず、`bundle_items` 非対応、新カテゴリも登録できない。

### 12-3. 月次データ運用フロー（実データ）

1. **CSVを置く** — `backend/data/` に配置する。
2. **生データで検証** — 年月・カテゴリ・金額を目視と機械の両方で確認。
3. **差分を提案** — 「変更前 → 変更後 ＋ 理由」の形で出す。
4. **オーナーの承認を得る** — ここを飛ばさない。
5. **原本を保全してから反映** — `backend/backup/YYYY-MM-DD/` に原本を置いてからCSVを更新し、再検証。
6. **SQLに変換** — `backend/scripts/csv_to_sql.py` で INSERT 文を生成。
7. **本番に流す** — `npx wrangler d1 execute kakei-db --remote --file=<生成したsql>`
8. **再クエリで突き合わせ** — 件数と合計が期待値と一致することを確認する。

### 12-4. データのプライバシー

実データ（家賃・投資額など）はリポジトリに入れない。`backend/data/`・`backend/backup/`・`*.db`・`.wrangler/`・`.dev.vars` はすべて gitignore 済み。リポジトリは公開されているため、コミット前に実額・メールアドレス・トークンが混ざっていないか確認する。

### 12-5. 二重実装の同期

> ⚠️ **不具合修正や挙動変更は必ず両方に入れる**
> `worker/src/*.ts` だけ直すと、ローカルのFastAPIと挙動がずれて「ローカルでは直ったのに本番で再発」「その逆」が起きる。テストも両方に書く。唯一の例外は割り勘連携（Worker専用）。

---

家計ダッシュボード3 — 仕様・設計・技術構成ドキュメント。
姉妹編: [割り勘アプリ連携の詳細](warikan-integration.md)。
関連: ルートの `CLAUDE.md`（作業ガイド）、`DESIGN.md`（デザイン仕様）、`ROLLBACK_warikan.md`（連携の戻し方）。
