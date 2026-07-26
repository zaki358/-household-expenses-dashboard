-- 初期カテゴリ・設定（現行 config.yaml と一致させる）

INSERT INTO category_groups (name, sort_order) VALUES
  ('収入', 0),
  ('固定費', 1),
  ('インフラ', 2),
  ('通信費', 3),
  ('変動費', 4),
  ('車', 5),
  ('バイク', 6),
  ('投資', 7);

INSERT INTO categories (name, group_name, income_owner, sort_order) VALUES
  ('夫給与', '収入', '夫', 0),
  ('妻給与', '収入', '妻', 1),
  ('ボーナス', '収入', NULL, 2),
  ('その他収入', '収入', NULL, 3),
  ('家賃', '固定費', NULL, 0),
  ('保険', '固定費', NULL, 1),
  ('サブスク', '固定費', NULL, 2),
  ('電気', 'インフラ', NULL, 0),
  ('ガス', 'インフラ', NULL, 1),
  ('水道', 'インフラ', NULL, 2),
  ('通信費', '通信費', NULL, 0),
  ('食費', '変動費', NULL, 0),
  ('消耗品', '変動費', NULL, 1),
  ('交際費', '変動費', NULL, 2),
  ('娯楽費', '変動費', NULL, 3),
  ('服', '変動費', NULL, 4),
  ('美容院', '変動費', NULL, 5),
  ('ガソリン(車)', '車', NULL, 0),
  ('車保険', '車', NULL, 1),
  ('車税金', '車', NULL, 2),
  ('車検', '車', NULL, 3),
  ('車整備', '車', NULL, 4),
  ('ガソリン(バイク)', 'バイク', NULL, 0),
  ('バイク保険', 'バイク', NULL, 1),
  ('バイク税金', 'バイク', NULL, 2),
  ('バイク整備', 'バイク', NULL, 3),
  ('NISA', '投資', NULL, 0),
  ('投資信託', '投資', NULL, 1),
  ('株式', '投資', NULL, 2),
  ('その他投資', '投資', NULL, 3);

INSERT INTO app_settings (key, value) VALUES
  ('investment_as_expense', 'true');
