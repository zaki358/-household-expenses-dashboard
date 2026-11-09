# 割り勘アプリ連携 — 仕組みと運用

> HTML版: [warikan-integration.html](warikan-integration.html)（同じ内容をスタイル付きで読める）
> 姉妹編: [家計ダッシュボード3 の仕様・設計・技術構成](tech-stack.md)
> 運用: ルートの `ROLLBACK_warikan.md`（戻し方の手順書）

家計ダッシュボード3 に入力した支出を、ボタン1つで割り勘アプリ（`warikan`）にも記録する機能。同じ買い物を2つのアプリに手で入れ直す手間をなくすために作った。Cloudflare の Service Binding で Worker 同士を直接つなぐ。

`Service Binding` `共有トークン認証` `冪等（external_ref）` `キルスイッチ` `一方向・手動トリガー`

## 目次

1. [何ができるか](#1-何ができるか)
2. [なぜ Service Binding なのか](#2-なぜ-service-binding-なのか)
3. [処理の流れ](#3-処理の流れ)
4. [認証とキルスイッチ](#4-認証とキルスイッチ)
5. [家計簿側の実装](#5-家計簿側の実装)
6. [割り勘側の実装](#6-割り勘側の実装)
7. [データの対応](#7-データの対応)
8. [カテゴリの扱い](#8-カテゴリの扱い)
9. [二重反映の防止](#9-二重反映の防止)
10. [削除のガード](#10-削除のガード)
11. [エラー一覧](#11-エラー一覧)
12. [セットアップ手順](#12-セットアップ手順)
13. [止め方・戻し方](#13-止め方戻し方)
14. [テスト](#14-テスト)
15. [既知の制限](#15-既知の制限)

---

## 1. 何ができるか

家計簿の入力タブで、日付が入っているエントリの行に「反映」ボタンが出る。押すとポップアップが開き、支払った人を選んで「反映する」を押すと、割り勘アプリに支出が1件作られる。

1. **家計簿にいつもどおり入力する** — 例: 変動費タブで「食費 / 11月5日 / 3,500円 / 詳細: 食材」。
2. **その行の「反映」を押す** — ポップアップが開き、反映内容（日付・カテゴリ・金額・詳細）が確認用に表示される。
3. **支払った人を選ぶ** — 候補は割り勘アプリの `users` から取ってくる。名前は家計簿側に持たないので、割り勘アプリで表示名を変えればここも自動で変わる。
4. **「反映する」を押す** — 割り勘アプリの該当月に `2026-11-05 / 食材 / 3,500円 / 食費 / たくま` が1件できる。
5. **行の表示が「反映済み」に変わる** — 同じ行をもう一度反映することはできない。隣の「取消」を押すと割り勘側の支出が消え、未反映に戻る。

### 反映ボタンが出る条件

| 条件 | 内容 |
|---|---|
| 連携が有効 | `GET /api/warikan/status` が `{"enabled": true}` を返すこと。Service Binding と共有トークンの両方が揃っている必要がある |
| 対象のタブ | **変動費・車・バイク・投資** のみ。割り勘は日付必須なので「日」を入力できるタブに限っている。家賃や給与、サブスクは対象外 |
| 日付が入っている | 日が未入力の行はボタンがグレーで押せない（`title` に「日付を入力すると割り勘に反映できます」） |
| 未反映である | 反映済みの行は「反映済み」ラベルと「取消」ボタンに置き換わる |

---

## 2. なぜ Service Binding なのか

割り勘アプリは **Cloudflare Access** で守られている。外部から `https://warikan.y-kakeibo.workers.dev/api/...` を叩いても、Worker に届く前にエッジで止められてログイン画面にリダイレクトされる。つまり「普通に fetch する」が使えない。

```
【通常の経路】ブラウザ → Cloudflare Access（認証）→ 割り勘 Worker
【今回の経路】家計簿 Worker ──[Service Binding]──→ 割り勘 Worker
                                  ↑ Access を通らない
```

### 検討した3案

| 方式 | 内容 | 採否 |
|---|---|---|
| **Service Binding** | 家計簿 Worker から割り勘 Worker を直接呼ぶ。エッジを通らないので Access の設定変更が要らない。代わりに共有トークンで認証する | ✅ **採用** |
| Access サービストークン | 公開URL経由で呼ぶ。Cloudflare ダッシュボードでサービストークンを発行し、Access のポリシーに Service Auth を追加する作業が必要。割り勘側の認証ミドルウェアもサービストークン対応に改修が要る | ❌ 不採用 |
| 割り勘の D1 を直接書く | 家計簿 Worker に `warikan-db` のバインディングを追加して直接 INSERT。割り勘側は一切触らずに済む | ❌ 不採用 |

> **D1 直書きを避けた理由**
> 割り勘アプリ側には「期間（`monthly_periods`）が無ければ作る」「確定済みの月を更新したら `is_dirty` を立てる」「カテゴリの実在チェック」といった業務ロジックがある。直書きするとこれらを家計簿側で再実装することになり、割り勘側のスキーマが変わるたびに静かに壊れる。**APIを通すことで、割り勘のルールは割り勘が持ったままにできる。**

---

## 3. 処理の流れ

1. **［ブラウザ］入力タブを開く**
   `EntryTab` がマウント時に `getConfig()` と並行して `getWarikanStatus()` を呼ぶ。失敗（404・連携なし）は**エラーにせず「連携無効」として扱う**ので、ローカルの FastAPI でも画面は壊れない。

2. **［ブラウザ］「反映」クリック → 支払者を取得**
   `WarikanDialog` が開き、`GET /api/warikan/users` を1回呼ぶ。候補が1人だけなら自動で選択し、「相手が割り勘アプリを一度も開いていない場合は候補に出ません」と添える。

3. **［家計簿 Worker］Service Binding で中継**
   `env.WARIKAN.fetch()` で `https://warikan.internal/api/internal/users` を呼ぶ。ホスト名はバインディングでは無視されるのでダミーでよい。

   ```ts
   // worker/src/warikan.ts
   service.fetch(new Request(`${BASE}${path}`, {
     ...init,
     headers: { ...init.headers, 'X-Internal-Token': token },
   }))
   ```

4. **［ブラウザ］支払者を選んで「反映する」**
   `POST /api/entries/{id}/warikan` に `{"paid_by": "<userId>"}` を送る。

5. **［家計簿 Worker］事前チェック**
   エントリを引き、(1) 存在するか → 404、(2) 既に反映済みでないか → 409、を見る。そのあと `buildExpensePayload()` が日付の有無・金額の上限・支払者の空を検証する（純関数なのでテストしやすい）。

6. **［家計簿 Worker → 割り勘 Worker］支出を作る**
   `POST /api/internal/expenses`。

   ```json
   {
     "externalRef": "kakei:entry:123",
     "ym":          "2026-11",
     "spentOn":     "2026-11-05",
     "paidBy":      "31fbc62a-...",
     "amount":      3500,
     "itemName":    "食材",
     "categoryName":"食費"
   }
   ```

7. **［割り勘 Worker］検証して書き込む**
   トークン検証 → zod → 年月と日付の整合 → **由来キーで既存チェック** → 支払者の実在 → カテゴリを名前で upsert → 期間を取得または作成 → INSERT。INSERT は「支出の追加」と「確定済み期間なら `is_dirty=1`」を `D1.batch` で原子的に実行する。

8. **［家計簿 Worker → D1］反映先IDを保存**
   返ってきた支出IDを `entries.warikan_expense_id` に書く。これで画面が「反映済み」になり、取消もできるようになる。

9. **［ブラウザ］一覧を取り直す**
   反映APIのレスポンスは**全グループ・全月の一覧**なので、そのまま画面に出すと変動費タブに家賃が混ざる。既存の追加・編集と同じく、絞り込み条件つきで `getEntries(month, group)` を呼び直す。

---

## 4. 認証とキルスイッチ

Service Binding は Cloudflare のエッジを通らないため、割り勘 Worker には Access の JWT が届かない。代わりに**共有トークン**で認証する。

| どこ | 名前 | 登録方法 |
|---|---|---|
| 割り勘 Worker | `INTERNAL_API_TOKEN` | `wrangler secret put`（ローカルは `apps/api/.dev.vars`） |
| 家計簿 Worker | `WARIKAN_INTERNAL_TOKEN` | `wrangler secret put`（ローカルは `worker/.dev.vars`） |

値は**同じであることだけが条件**で、人間が覚えておく必要はない。やり直したいときは新しい値を両方に入れ直せばよい。

### 4-1. 検証の実装

`apps/api/src/middleware/internalAuth.ts`。`X-Internal-Token` ヘッダを定数時間で比較する。早期 return で異なる位置が分かるとトークンを1文字ずつ推測できてしまうため、長さが同じ場合は必ず全文字を走査する。

```ts
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
```

### 4-2. 二重の守り

| 経路 | 何が守るか |
|---|---|
| インターネットから `/api/internal/*` | **Cloudflare Access** が Worker に届く前に遮断（302でログイン画面へ） |
| Service Binding から | **共有トークン**。Access は通らないのでここが唯一の関門 |

内部APIのパスを `/api/` 配下にしているのは、`wrangler.jsonc` の `run_worker_first` が `["/api/*"]` のため。`/internal/*` などにすると静的アセットの SPA フォールバックに食われて Worker に届かない。

### 4-3. キルスイッチ

> **トークンかバインディングのどちらかを外せば、連携前の挙動に完全に戻る**
> 家計簿側は `isWarikanEnabled()` が `Boolean(service && token)` なので、どちらかが無ければ `GET /api/warikan/status` が `false` を返し、画面から「反映 / 反映済み / 取消」が消える。割り勘側も `INTERNAL_API_TOKEN` 未設定なら内部APIを全て403で閉じる（fail-closed）。

反映済みの行の「削除」をブロックするガードも、連携が無効な間は**外れる**。連携を切った後に家計簿のエントリが消せなくなる、という詰みを避けるため。

---

## 5. 家計簿側の実装

| ファイル | 内容 |
|---|---|
| `worker/wrangler.toml` | Service Binding の宣言。`[[services]] binding = "WARIKAN" / service = "warikan"`。トークンは `[vars]` に書かずシークレットで渡す |
| `worker/src/warikan.ts`（181行） | 連携クライアント。HTTPの都合だけを持ち、ルーティングとは分離している。`WarikanService` は `Fetcher` 互換の最小インターフェースなので、テストではフェイクを差し込める |
| `worker/src/errors.ts` | `HttpError`。もともと `index.ts` にあったものを、`warikan.ts` から投げられるよう切り出した（循環 import を避けるため） |
| `worker/src/repo.ts` | `EntryRow` に `割り勘ID` を追加。`listEntries` の SELECT に列を足し、`findEntryById`（1件取得）と `setWarikanExpenseId`（反映先IDの保存・クリア）を新設 |
| `worker/src/index.ts` | ルート4本の追加と、既存 `DELETE /api/entries/{id}` へのガード追加 |
| `worker/migrations/0005_add_entry_warikan_id.sql` | `ALTER TABLE entries ADD COLUMN warikan_expense_id TEXT`。`backend/migrations/` にも同じものを置く |
| `frontend/src/components/Modal.tsx` | このアプリ初のモーダル。`createPortal` で body 直下へ。`z-[60]` なのはスマホ下部タブバーが `z-50` のため。Escape と背景クリックで閉じ、開いている間は背面スクロールを止める |
| `frontend/src/features/entry/WarikanDialog.tsx` | 反映ポップアップ。支払者の取得・選択・送信とエラー表示 |
| `frontend/src/features/entry/EntryTab.tsx` | `WARIKAN_TABS` 定数、`showWarikan` prop、行の3状態（反映／反映済み+取消／無効）の描画、取消ハンドラ |
| `frontend/src/api/client.ts` / `types.ts` | `getWarikanStatus` / `getWarikanUsers` / `reflectToWarikan` / `cancelWarikanReflect` と、`IndexedEntry.割り勘ID`・`WarikanUser`・`WarikanStatus` |

### 追加したルート

| メソッド | パス | 挙動 |
|---|---|---|
| GET | `/api/warikan/status` | `{"enabled": boolean}`。フロントはこれを見て反映UIを出すか決める |
| GET | `/api/warikan/users` | `[{"user_id": "...", "display_name": "..."}]`。割り勘側の camelCase を家計簿の snake_case に変換している |
| POST | `/api/entries/{id}/warikan` | body は `{"paid_by": "<userId>"}`。成功すると更新後のエントリ一覧を返す |
| DELETE | `/api/entries/{id}/warikan` | 反映の取り消し。割り勘側が404（既に手で消されていた）でも成功扱いにして、家計簿側の記録だけクリアし整合を取る |

---

## 6. 割り勘側の実装

リポジトリは `C:\Users\barub\Project\warikan`、ブランチは `feature/kakei-integration`。

| ファイル | 内容 |
|---|---|
| `apps/api/migrations/0003_external_ref.sql` | `monthly_expenses.external_ref` の追加と UNIQUE インデックス。SQLite の UNIQUE は NULL を重複扱いしないので、割り勘アプリ内で手入力した支出（NULL）は何件でも共存できる |
| `apps/api/src/middleware/internalAuth.ts` | 共有トークンの検証。`accessAuth` と違い `c.var.user` は立てない（呼び出し元が支払者を明示するため） |
| `apps/api/src/routes/internal.ts` | 内部API 3本。画面向けAPI（`/api/monthly` 等）とは分けてあり、**こちら側だけが**「カテゴリ名での自動作成」と「由来キーによる冪等性」を持つ |
| `apps/api/src/index.ts` | `app.use("/api/*", accessAuth())` **より前**に `app.route("/api/internal", internalRoutes)` を登録 |
| `apps/api/src/db/categories.ts` | `upsertCategoryByName()` を追加 |
| `apps/api/src/db/monthly.ts` | `ExpenseInput.externalRef`、`insertExpense` の列追加、`findExpenseByExternalRef()` |
| `apps/api/src/lib/ym.ts` | `spentOnInPeriod()` を `routes/monthly.ts` から移動（内部APIと共用するため） |

### 内部API

| メソッド | パス | 挙動 |
|---|---|---|
| GET | `/api/internal/users` | `{ok:true, data:[{userId, displayName}]}` |
| POST | `/api/internal/expenses` | 新規なら **201** + `created:true`、既に同じ `externalRef` があれば **200** + `created:false` で既存行を返す |
| DELETE | `/api/internal/expenses/{id}` | 外部由来の支出だけ削除できる。`external_ref` が NULL の行（＝割り勘アプリ内で手入力したもの）は403で拒否する安全弁 |

### リクエストのスキーマ（zod）

```ts
z.object({
  externalRef:  z.string().trim().min(1).max(100),
  ym:           z.string().regex(/^\d{4}-\d{2}$/),
  spentOn:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidBy:       z.string().min(1),
  amount:       z.number().int().min(1).max(10_000_000),
  itemName:     z.string().trim().min(1).max(60),
  categoryName: z.string().trim().min(1).max(20).nullable().optional(),
})
```

---

## 7. データの対応

家計簿と割り勘ではデータの形が違う。特に**割り勘には「詳細/メモ」欄が無い**（自由記述は品目名60文字だけ）のが効いてくる。

| 家計簿 `entries` | → | 割り勘 `monthly_expenses` | 変換のルール |
|---|---|---|---|
| `年月` + `日` | → | `spent_on` | `` `${年月}-${String(日).padStart(2,'0')}` ``。日が `null` なら反映不可 |
| `金額` | → | `amount` | そのまま。上限 10,000,000 を超えるものは家計簿側で先に弾く |
| `備考`（詳細） | → | `item_name` | **詳細が空ならカテゴリ名で代替**。60文字で切り詰める |
| `カテゴリ` | → | `category_id` | IDではなく**名前**を渡し、割り勘側が名前で引く／無ければ作る |
| （画面で選ぶ） | → | `paid_by` | 割り勘の `users.id`（UUID）。家計簿には人の概念が無いので毎回選ぶ |
| `id` | → | `external_ref` | `kakei:entry:<id>` の形。二重反映の判定キー |
| `warikan_expense_id` | ← | `id` | 割り勘が発行したUUIDを家計簿が保持する（逆方向） |

### 変換を行う純関数

```ts
// worker/src/warikan.ts
export function buildExpensePayload(entry: EntryRow, paidBy: string): WarikanExpensePayload {
  if (entry.日 === null) throw new ValidationError('日付が未入力のため割り勘に反映できません')
  if (entry.金額 > WARIKAN_MAX_AMOUNT) throw new ValidationError('...')
  const payer = paidBy.trim()
  if (!payer) throw new ValidationError('支払った人を選択してください')

  return {
    externalRef:  `kakei:entry:${entry.id}`,
    ym:           entry.年月,
    spentOn:      `${entry.年月}-${String(entry.日).padStart(2, '0')}`,
    paidBy:       payer,
    amount:       entry.金額,
    itemName:     (entry.備考.trim() || entry.カテゴリ).slice(0, WARIKAN_MAX_ITEM_NAME),
    categoryName: entry.カテゴリ,
  }
}
```

検証をこの純関数に集めているので、ルート側は「404か409か」だけを見ればよく、変換と検証はテストで直接叩ける。

---

## 8. カテゴリの扱い

2つのアプリでカテゴリ名が揃っていなかった。**一致するのは「食費」だけ**だった。

| 家計簿（変動費） | 割り勘の seed（7個） |
|---|---|
| 食費 | 食費 ✅ |
| 消耗品 | 日用品 |
| 交際費 | 外食 |
| 娯楽費 | 娯楽 |
| 服 / 美容院 | （対応なし） |
| ガソリン(車) / ガソリン(バイク) | 交通費 |

### 採った方針 — 家計簿を正本にして、使った名前をその場で生やす

対応表をコードに持つ案もあったが、家計簿にカテゴリを追加するたびに表を書き足す必要があり、忘れると静かに「未分類」になる。そこで**割り勘の内部APIはカテゴリIDではなく名前を受け取り、無ければ作る**ことにした。

```sql
INSERT INTO categories (name, sort_order, is_active)
VALUES (?, 900, 1)
ON CONFLICT (name) DO UPDATE SET is_active = 1
```

- `categories.name` が UNIQUE なので競合しても1行に収まる
- `sort_order = 900` で seed の7個（10〜99）より**後ろ**に並べ、割り勘の手入力フォームのドロップダウンの先頭を荒らさない
- 既存行が `is_active = 0` だった場合は 1 に戻す。家計簿で実際に使われているカテゴリが非表示のままだと、一覧でカテゴリ名が出なくなるため

> **定期同期（cron）にしなかった理由**
> 家計簿の30カテゴリのうち割り勘で意味があるのは一部で、家賃やNISAをドロップダウンに出しても邪魔なだけ。定期実行には逆方向のバインディングと cron が要る。「使ったときに生やす」なら、実際に反映したカテゴリだけが自然に増える。
> なお家計簿には**カテゴリのリネーム機能が無く**（追加と削除だけ）、削除も実績データがあると400で拒否されるため、「反映済みのカテゴリが家計簿から消える／名前が変わる」はほぼ起きない。

割り勘の既存7カテゴリは**そのまま残している**（過去データに触らない方針）。結果として、割り勘のドロップダウンには「日用品」と「消耗品」が並ぶ。気になれば後から統合できる。

---

## 9. 二重反映の防止

割り勘アプリにはもともと冪等性の仕組みが無く、同じJSONを2回送れば支出が2件できた。**2段構え**で防いでいる。

### ① 家計簿側 — 反映先IDを持つ（`entries.warikan_expense_id`）

反映に成功したら割り勘が返した支出IDを保存する。

- 画面に「反映済み」と出せる
- ボタンを押せなくできる
- 「取消」で割り勘側の支出を特定して消せる
- APIでも `409` で弾く

### ② 割り勘側 — 由来キーに UNIQUE（`monthly_expenses.external_ref`）

同じ `kakei:entry:123` で2回目が来たら、新規作成せず**既存の行をそのまま返す**（`created:false`）。

- ①が通信断で保存に失敗した場合の最後の砦
- 同時実行で UNIQUE 違反になった場合も catch して既存行を返す

> **なぜ両方いるのか**
> ①だけだと穴が残る。「割り勘側への登録は成功したが、家計簿側にIDを保存する直前に通信が切れた／タブを閉じた」とき、家計簿は未反映のままなのでもう一度押せてしまい、割り勘側に2件できる。②があればその2回目もDBが1件にまとめる。

---

## 10. 削除のガード

反映済みのエントリは、家計簿側の `DELETE /api/entries/{id}` が **409「先に割り勘への反映を取り消してください」** で拒否する。画面でも「削除」ボタンが無効になる。

家計簿側だけ消すと、割り勘に由来不明の支出が残り、しかも取り消す手段（反映先IDの記録）も同時に失われるため。取り消しは1クリックなので運用コストは小さいと判断した。

> **連携を切ったら外れる**
> このガードは `isWarikanEnabled()` が true のときだけ効く。連携を止めた後に `warikan_expense_id` が残った行が消せなくなる、という詰みを避けている。

逆方向の安全弁として、割り勘側の `DELETE /api/internal/expenses/{id}` は `external_ref` が NULL の支出（＝割り勘アプリ内で手入力したもの）を403で拒否する。家計簿からの操作で割り勘の手入力データが消えることはない。

---

## 11. エラー一覧

割り勘側のエンベロープ `{ok,data,error}` は家計簿側で剥がされ、家計簿の `{"detail": "..."}` 形式に変換される。

| 状況 | 家計簿が返すもの | 画面での見え方 |
|---|---|---|
| エントリが無い | `404 エントリが存在しません` | ダイアログ内にエラー表示 |
| 既に反映済み | `409 既に割り勘へ反映済みです` | 通常は起きない（ボタンが出ない） |
| 日付が未入力 | `400 日付が未入力のため割り勘に反映できません` | 通常は起きない（ボタンが無効） |
| 金額が上限超過 | `400 割り勘に反映できる金額は10,000,000円までです` | ダイアログ内にエラー表示 |
| 支払者が未選択 | `400 支払った人を選択してください` | 通常は起きない（ボタンが無効） |
| 割り勘側が400（支払者・カテゴリ・日付） | `400 割り勘アプリ: <元のメッセージ>` | 原因がそのまま読める |
| 割り勘側が403（トークン不一致・内部API無効） | `503 割り勘アプリとの連携が許可されていません` | 設定の問題として扱う |
| 連携が未設定 | `503 割り勘アプリとの連携が設定されていません` | 通常は起きない（UIが出ない） |
| 割り勘Workerに到達できない | `502 割り勘アプリに接続できませんでした` | ローカルで割り勘を起動し忘れたとき等 |
| その他 | `502 割り勘アプリとの通信に失敗しました` | — |

---

## 12. セットアップ手順

### 12-1. ローカル開発

Service Binding は wrangler の dev registry 経由で解決されるので、**両方の `wrangler dev` を同時に起動しておく**必要がある（ポートが衝突しないようどちらかをずらす）。

**1. 両方の `.dev.vars` に同じトークンを書く**

```
warikan: apps/api/.dev.vars   INTERNAL_API_TOKEN=local-dev-internal-token
kakei:   worker/.dev.vars     WARIKAN_INTERNAL_TOKEN=local-dev-internal-token
```

**2. ローカルD1にマイグレーションを当てる**

```bash
cd C:/Users/barub/Project/warikan/apps/api && npx wrangler d1 migrations apply warikan-db --local
```

```bash
cd C:/Users/barub/company/kakei-dashboard-3/worker && npx wrangler d1 migrations apply kakei-db --local
```

**3. 割り勘を起動（別ターミナル）**

```bash
cd C:/Users/barub/Project/warikan/apps/api && npx wrangler dev --port 8788
```

**4. 家計簿を起動（別ターミナル）**

```bash
cd C:/Users/barub/company/kakei-dashboard-3/frontend && npm run build && cd ../worker && npx wrangler dev --port 8787
```

割り勘側の `.dev.vars` に `DEV_BYPASS_EMAIL` を入れておくと自分の `users` 行が作られる。相手役は `npx wrangler d1 execute warikan-db --local --command "INSERT INTO users ..."` で用意する。

確認は `curl http://127.0.0.1:8787/api/warikan/status` が `{"enabled":true}` を返すか、`/api/warikan/users` が割り勘のユーザーを返すか。後者が通れば Service Binding とトークンの往復ができている。

### 12-2. 本番へのデプロイ

**1. 本番D1をバックアップする**

```bash
npx wrangler d1 export kakei-db --remote --output kakei-before.sql
```

```bash
npx wrangler d1 export warikan-db --remote --output warikan-before.sql
```

出力は gitignore 済みの場所（`backend/backup/` など）へ。

**2. 共有シークレットを登録する** — 同じ値を両方に。値は人間が覚えなくてよい。

```bash
cd .../warikan/apps/api && npx wrangler secret put INTERNAL_API_TOKEN
```

```bash
cd .../kakei-dashboard-3/worker && npx wrangler secret put WARIKAN_INTERNAL_TOKEN
```

**3. マイグレーションを適用する** — どちらも列の追加だけなので既存データは変わらない。

```bash
npx wrangler d1 migrations apply warikan-db --remote
```

```bash
npx wrangler d1 migrations apply kakei-db --remote
```

**4. 割り勘を先にデプロイする** — 内部APIが無いと家計簿から呼べない。`npm run build -w @warikan/web` してから `npx wrangler deploy`。

**5. 家計簿をデプロイする**

```bash
cd frontend && npm run build && cd ../worker && npx wrangler deploy
```

デプロイ出力の bindings に `env.WARIKAN (warikan)` が出ていることを確認する。

**6. 動作確認** — 本番は Cloudflare Access の内側なのでブラウザで確認する。入力タブの変動費に「反映」が出ていれば `status` が true。少額の1件で「反映 → 割り勘アプリで確認 → 取消」まで通しておくと安心。

> ⚠️ **シークレットを入れるまで連携はOFF**
> デプロイしただけでは `status` が false のままで、画面は連携前とまったく同じ。「デプロイしてから落ち着いて有効化する」ことができる。

---

## 13. 止め方・戻し方

詳細はルートの `ROLLBACK_warikan.md` にある。段階1だけで画面も挙動も連携前に戻る。

| 段階 | やること | データへの影響 |
|---|---|---|
| **1** | `npx wrangler secret delete WARIKAN_INTERNAL_TOKEN` → 再デプロイ | なし。反映UIが消えて連携前の画面に戻る |
| **2** | `DELETE FROM monthly_expenses WHERE external_ref LIKE 'kakei:%'` / `UPDATE entries SET warikan_expense_id = NULL` | 家計簿由来の支出だけ消える。割り勘で手入力した分は `external_ref` が NULL なので無傷 |
| **3** | コードを戻す（割り勘は `git switch master`、家計簿は `backend/backup/2026-11-04_warikan連携前/` の `.orig`） | — |
| **4** | DB列を消す（通常不要） | 追加しただけの列なので残しても無害 |

> **段階2の精算やり直し**
> 確定済み（settled）の月から支出を消した場合、割り勘アプリの精算結果は古いままになる。割り勘アプリで「計算する」をやり直すこと。

---

## 14. テスト

| 場所 | 件数 | 内容 |
|---|---|---|
| `warikan/apps/api/test/internal.test.ts` | 18 | トークン無し／不一致／未設定で403、支出作成、**同じ externalRef で2回送っても1件**、カテゴリ自動作成、対象月外・存在しない支払者で400、外部由来のみ削除可、確定済み期間で `is_dirty` が立つ |
| `worker/tests/warikan.test.ts` | 24 | `buildExpensePayload` の純関数テスト（備考が空ならカテゴリ名／60字切り詰め／日のゼロ埋め／上限）と、フェイク Fetcher を使った `createExpense` / `deleteExpense`（エンベロープ剥がし、403→503、500→502、到達不能→502） |
| `worker/tests/repo.entries.test.ts` | +6 | 追加直後は `割り勘ID` が null、`findEntryById` の往復、反映状態が金額更新で消えないこと |
| `frontend/.../EntryTab.test.tsx` | +10 | 連携無効なら反映ボタンが出ない、日付なしは無効、固定費タブには出ない、支払者を選んで送信、失敗時のエラー表示、反映済みの行は削除が無効、取消で元に戻る、**反映後に絞り込み条件つきで取り直す** |

テストで Service Binding を差し替えられるよう、`warikan.ts` は `Fetcher` そのものではなく `{ fetch(request): Promise<Response> }` という最小インターフェースを受け取る設計にしている。

---

## 15. 既知の制限

- **反映後に家計簿側で金額やカテゴリを編集しても割り勘には伝わらない。** 直すなら「取消 → 反映」の2クリック。双方向同期は作っていない
- 割り勘アプリ側で手入力した支出は家計簿に入ってこない（**一方向**）
- サブスク・通信費（`bundle_items`）は日付を持たないので対象外
- 割り勘アプリで**相手が一度もログインしていないと `users` に行が無く**、支払者として選べない（割り勘アプリ側の既知の制約）
- カテゴリは「使ったときに生える」ので、家計簿でカテゴリ名を変えても割り勘の既存カテゴリ名は変わらない（家計簿にリネーム機能が無いため実際には起きにくい）
- ローカルの FastAPI（`backend/`）では連携が使えない。Service Binding が Workers 専用のため。`/api/warikan/status` が404になり、反映ボタンは出ない（正常動作）
- 金額は 10,000,000 円が上限（割り勘アプリ側の制約に合わせている）

---

割り勘アプリ連携 — 仕組みと運用。
姉妹編: [家計ダッシュボード3 の仕様・設計・技術構成](tech-stack.md)。
関連: ルートの `ROLLBACK_warikan.md`（戻し方の手順書）、`CLAUDE.md`（二重実装の例外として記載）。
