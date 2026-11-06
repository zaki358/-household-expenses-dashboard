-- 変動費などの明細に「何を買ったか」を残すための備考欄。
-- 空欄を許すが NULL は使わない（読み出し側の分岐を増やさないため）。
ALTER TABLE entries ADD COLUMN note TEXT NOT NULL DEFAULT '';
