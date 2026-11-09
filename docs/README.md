# docs/ — 説明書

同じ内容を **Markdown版**（GitHub上でそのまま読める）と **HTML版**（ブラウザで開くとスタイル付き）の2通りで置いている。内容を直すときは**両方を更新する**こと。

| 内容 | Markdown版（GitHub） | HTML版（ブラウザ） |
|---|---|---|
| 仕様・設計・技術構成 | [tech-stack.md](tech-stack.md) | `tech-stack.html` |
| 割り勘アプリ連携の仕組みと運用 | [warikan-integration.md](warikan-integration.md) | `warikan-integration.html` |

`docs.css` は HTML版が共有しているスタイルシート。

## 関連ドキュメント（リポジトリのルート）

| ファイル | 内容 |
|---|---|
| `README.md` | 概要・起動方法・API一覧・v1/v2/v3 の系統 |
| `DESIGN.md` | デザイン仕様。UI変更前に必ず読む正式な仕様書 |
| `CLAUDE.md` | 開発時の作業ガイド（二重実装の同期ルールなど） |
| `ROLLBACK_warikan.md` | 割り勘連携の戻し方（段階1〜4） |
