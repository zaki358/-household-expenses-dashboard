# 家計簿ダッシュボード2

既存の `kakei-dashboard`（Streamlit）と同じ仕様・機能を、フロントエンドだけ React に刷新した版。
既存アプリには一切変更を加えていない。データも完全に独立（このディレクトリ専用の `backend/data/`）。

デザインは `DESIGN.md`（PlayStation風デザイントークン + このアプリへの適用方針）に準拠。

## 構成

```
kakei-dashboard-2/
├── DESIGN.md          # デザイン仕様（フロント実装の基準）
├── backend/           # FastAPI + 既存ロジック層（コピー・無修正）
│   ├── src/           # aggregate/goal/loader/entries/bundle_store/months/config（既存からコピー）
│   ├── api/           # 新規・薄いHTTP変換層（routers/schemas/serializers/deps）
│   ├── data/           # 専用CSVフォルダ（sample.csv は動作確認用）
│   ├── config.yaml
│   └── tests/          # 既存77+ pytest（コピー）+ 新規APIテスト
└── frontend/           # React + Vite + TypeScript + Tailwind（DESIGN.md準拠）
```

## 起動方法

### 簡単起動（推奨）

既存 `kakei-dashboard` の `起動.bat` と同じ要領で、`起動.bat` をダブルクリックするだけでバックエンド・フロントエンドが両方起動し、ブラウザが自動で開く。終了はウィンドウを閉じるか Ctrl+C。

初回はフロントエンドの依存パッケージ（`node_modules`）が無ければ自動で `npm install` を行う。

### バックエンド（個別に起動する場合）
```
cd backend
pip install -r requirements.txt
pytest                      # 全テスト確認
uvicorn main:app --reload   # http://localhost:8000
```

### フロントエンド
```
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

## API

既存ロジック層（`src/aggregate.py` 等）をそのまま呼び出す薄いラッパー。計算ロジックは1行も書き直していない。

| エンドポイント | 用途 |
|---|---|
| `GET /api/summary` | 全月サマリー |
| `GET /api/dashboard?month=` | 選択月のKPI + 前月比較 |
| `GET /api/charts?month=` | 円グラフ・棒グラフ・資産推移用データ |
| `GET/POST/PUT/DELETE /api/entries` | 収入・固定費・インフラ・投資のCRUD |
| `GET/POST/PUT/DELETE /api/bundles/{subscriptions\|communications}` | サブスク・通信費のCRUD |
| `GET /api/goals`, `/api/goals/status` | 目標一覧・達成状況 |
| `POST/DELETE /api/goals`, `PUT /api/goals/active` | 目標の追加・削除・アクティブ切替 |
| `POST /api/months/next` | 翌月作成（固定費・サブスク引き継ぎ） |
| `GET /api/config`, `PUT /api/config/investment-mode`, `POST /api/config/categories` | 設定 |

## 実装フェーズ

- Phase 0: 足場・デザインシステム ✅
- Phase 1: 表示系（ダッシュボード・グラフ）✅
- Phase 2: データ入力（entries・bundles）✅
- Phase 3: 目標・設定・翌月作成 ✅
