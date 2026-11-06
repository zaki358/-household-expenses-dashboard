# 割り勘連携のロールバック手順

家計簿ダッシュボード3 →  割り勘アプリ（`C:\Users\barub\Project\warikan`）への「反映」機能を、
使いづらい・データがおかしいなどの理由で元に戻したいときの手順。

**段階1だけで、画面も挙動も連携前に戻る。** 段階2以降は必要になったときだけ実施する。

---

## 事前に: 本番データのバックアップ（デプロイ前に1回やる）

```bash
cd C:/Users/barub/Project/warikan/apps/api && npx wrangler d1 export warikan-db --remote --output ./warikan-db-before-kakei.sql
```
```bash
cd C:/Users/barub/company/kakei-dashboard-3/worker && npx wrangler d1 export kakei-db --remote --output ./kakei-db-before-warikan.sql
```

出力したファイルは `backend/backup/` など gitignore 済みの場所へ移しておく。

---

## 段階1: 機能を止める（最短・データに触らない）

連携は **「Service Binding」と「共有トークン」の両方が揃っていないと動かない** 作りになっている。
どちらかを外すと、家計簿の `GET /api/warikan/status` が `{"enabled": false}` を返し、
**一覧の「反映」ボタンと「反映済み/取消」の表示が画面から消える**。
入力・編集・削除・集計・グラフはすべて連携前と同じ挙動に戻る。

```bash
cd C:/Users/barub/company/kakei-dashboard-3/worker && npx wrangler secret delete WARIKAN_INTERNAL_TOKEN
```
```bash
cd C:/Users/barub/company/kakei-dashboard-3/frontend && npm run build && cd ../worker && npm run deploy
```

ローカル開発で止める場合は `worker/.dev.vars` の `WARIKAN_INTERNAL_TOKEN=` の行を消すだけでよい。

割り勘アプリ側から塞ぎたい場合はこちらでも同じ効果がある（内部APIが403で閉じる）:

```bash
cd C:/Users/barub/Project/warikan/apps/api && npx wrangler secret delete INTERNAL_API_TOKEN && npm run deploy
```

**注意**: 連携を止めると、既に反映済みの行の「取消」ボタンも消える。
反映済みの支出を割り勘側から消したい場合は、止める前に画面から取消するか、段階2を使う。
（反映済みの行の「削除」をブロックするガードも連携が無効な間は外れるので、家計簿側の削除は普通にできる。）

---

## 段階2: 割り勘アプリに入ったデータだけを消す

家計簿から反映された支出には `external_ref = 'kakei:entry:<id>'` が入っている。
**割り勘アプリ内で手入力した支出は `external_ref` が NULL** なので、下記は家計簿由来の行だけを消す。

まず件数を確認する:

```bash
cd C:/Users/barub/Project/warikan/apps/api && npx wrangler d1 execute warikan-db --remote --command "SELECT COUNT(*) AS n, SUM(amount) AS total FROM monthly_expenses WHERE external_ref LIKE 'kakei:%'"
```

消す:

```bash
cd C:/Users/barub/Project/warikan/apps/api && npx wrangler d1 execute warikan-db --remote --command "DELETE FROM monthly_expenses WHERE external_ref LIKE 'kakei:%'"
```

家計簿側の「反映済み」の記録も消す:

```bash
cd C:/Users/barub/company/kakei-dashboard-3/worker && npx wrangler d1 execute kakei-db --remote --command "UPDATE entries SET warikan_expense_id = NULL"
```

確定済み（settled）の月から支出を消した場合、割り勘アプリの精算結果は古いままなので
割り勘アプリで「計算する」をやり直す。

自動作成されたカテゴリ（`sort_order = 900`）も消したい場合:

```bash
cd C:/Users/barub/Project/warikan/apps/api && npx wrangler d1 execute warikan-db --remote --command "DELETE FROM categories WHERE sort_order >= 900 AND id NOT IN (SELECT category_id FROM monthly_expenses WHERE category_id IS NOT NULL)"
```

---

## 段階3: コードを元に戻す

### 割り勘アプリ（`C:\Users\barub\Project\warikan`）

作業は `feature/kakei-integration` ブランチに閉じている。master に戻すだけ。

```bash
cd C:/Users/barub/Project/warikan && git switch master
```

デプロイも戻す場合:

```bash
cd C:/Users/barub/Project/warikan/apps/api && npm run deploy
```

### 家計簿（このリポジトリ）

このリポジトリは連携作業の前から多数の未コミット変更があったため、**git では戻せない**
（`git checkout` すると連携と無関係な作業も消える）。代わりに変更前の原本を
`backend/backup/2026-11-04_warikan連携前/` に `.orig` 付きで保存してある。

変更したファイル（原本あり）:

| ファイル | 原本 |
|---|---|
| `worker/src/index.ts` | `backend/backup/2026-11-04_warikan連携前/worker/src/index.ts.orig` |
| `worker/src/repo.ts` | 同ディレクトリの `worker/src/repo.ts.orig` |
| `worker/wrangler.toml` | 同 `worker/wrangler.toml.orig` |
| `worker/tests/repo.entries.test.ts` | 同 `worker/tests/repo.entries.test.ts.orig` |
| `frontend/src/api/client.ts` | 同 `frontend/src/api/client.ts.orig` |
| `frontend/src/api/types.ts` | 同 `frontend/src/api/types.ts.orig` |
| `frontend/src/features/entry/EntryTab.tsx` | 同 `frontend/src/features/entry/EntryTab.tsx.orig` |
| `frontend/src/features/entry/EntryTab.test.tsx` | 同 `frontend/src/features/entry/EntryTab.test.tsx.orig` |
| `backend/src/repo.py` | 同 `backend/src/repo.py.orig` |
| `backend/api/schemas.py` | 同 `backend/api/schemas.py.orig` |
| `backend/tests/test_api_entries.py` | 同 `backend/tests/test_api_entries.py.orig` |
| `CLAUDE.md` | 同 `CLAUDE.md.orig` |

新規追加したファイル（消すだけ）:

- `worker/src/warikan.ts`, `worker/src/errors.ts`, `worker/tests/warikan.test.ts`
- `worker/migrations/0005_add_entry_warikan_id.sql`, `backend/migrations/0005_add_entry_warikan_id.sql`
- `frontend/src/components/Modal.tsx`, `frontend/src/features/entry/WarikanDialog.tsx`
- `ROLLBACK_warikan.md`（このファイル）

戻したら必ずテストを通してからデプロイする:

```bash
cd C:/Users/barub/company/kakei-dashboard-3/worker && npm test && npm run typecheck
```

---

## 段階4: DBの列を消す（通常は不要）

`entries.warikan_expense_id` と `monthly_expenses.external_ref` は **追加しただけの列**で、
NULL のままなら既存の集計・CSV・画面に一切影響しない。残しておいて構わない。
どうしても消す場合のみ:

```bash
cd C:/Users/barub/company/kakei-dashboard-3/worker && npx wrangler d1 execute kakei-db --remote --command "ALTER TABLE entries DROP COLUMN warikan_expense_id"
```
```bash
cd C:/Users/barub/Project/warikan/apps/api && npx wrangler d1 execute warikan-db --remote --command "DROP INDEX idx_monthly_expenses_external_ref; ALTER TABLE monthly_expenses DROP COLUMN external_ref"
```

列を消すと `migrations` の適用済み記録と実テーブルがずれるため、
段階3でマイグレーションファイルも一緒に削除しておくこと。
`--remote`（本番）と `--local`（開発）を取り違えないよう毎回確認する。
