"""CSV取込・書き出し API のテスト。in-memory DB で検証する。"""

CSV = (
    "年月,カテゴリ,金額\n"
    "2026-05,食費,1200\n"
    "2026/6,家賃,85000\n"       # 年月正規化 → 2026-06
    "2026-05,食費,\n"           # 金額不正 → skip
).encode("utf-8-sig")


def test_import_dry_run_does_not_commit(client):
    res = client.post("/api/import/csv", params={"dry_run": True}, content=CSV)
    assert res.status_code == 200
    body = res.json()
    assert body["dry_run"] is True
    assert body["committed"] == 0
    # 変更前→変更後の提案（2件）とスキップ（1件）
    assert len(body["proposals"]) == 2
    assert len(body["skipped"]) == 1
    normalized = {p["年月"] for p in body["proposals"]}
    assert normalized == {"2026-05", "2026-06"}
    # まだ集計には反映されていない
    assert client.get("/api/summary").json()["months"] == []


def test_import_commit_inserts_rows(client):
    res = client.post("/api/import/csv", params={"dry_run": False}, content=CSV)
    assert res.status_code == 200
    body = res.json()
    assert body["committed"] == 2
    months = client.get("/api/summary").json()["months"]
    assert months == ["2026-05", "2026-06"]


def test_import_missing_columns_400(client):
    bad = "日付,品目,値段\n2026-05,食費,1200\n".encode("utf-8-sig")
    res = client.post("/api/import/csv", content=bad)
    assert res.status_code == 400


def test_import_empty_body_400(client):
    res = client.post("/api/import/csv", content=b"")
    assert res.status_code == 400


def test_import_reports_unknown_categories(client):
    csv = "年月,カテゴリ,金額\n2026-05,謎カテゴリ,500\n".encode("utf-8-sig")
    res = client.post("/api/import/csv", params={"dry_run": True}, content=csv)
    assert res.status_code == 200
    assert res.json()["unknown_categories"] == ["謎カテゴリ"]


def test_export_entries_csv(client, seed):
    seed(entries=[("2026-05", "食費", 1200), ("2026-05", "家賃", 85000, "manual")])
    res = client.get("/api/export/entries.csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    text = res.content.decode("utf-8-sig")
    assert text.splitlines()[0] == "年月,カテゴリ,金額"
    assert "2026-05,食費,1200" in text
    assert "2026-05,家賃,85000" in text


def test_export_bundle_csv(client, seed):
    seed(bundles=[("subscriptions", "2026-05", "Netflix", 1490)])
    res = client.get("/api/export/bundles/subscriptions.csv")
    assert res.status_code == 200
    text = res.content.decode("utf-8-sig")
    assert text.splitlines()[0] == "年月,名前,金額"
    assert "2026-05,Netflix,1490" in text


def test_export_unknown_bundle_kind_404(client):
    res = client.get("/api/export/bundles/unknown.csv")
    assert res.status_code == 404
