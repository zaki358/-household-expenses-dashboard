-- 変動費・車・バイク・投資の明細に「その月の何日か」を任意で残すための列。
-- 月は month 列が持つので日だけを保存する。NULL は「日付なし」
-- （既存データ・翌月に引き継いだ固定費など）。月末日との整合はアプリ側で検証する。
ALTER TABLE entries ADD COLUMN day INTEGER CHECK (day IS NULL OR day BETWEEN 1 AND 31);
