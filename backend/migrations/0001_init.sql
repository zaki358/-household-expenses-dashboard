-- 家計ダッシュボード3 初期スキーマ（D1 / SQLite 共通）
-- CSV(data/*.csv, dashboard_input.csv, dashboard_*.csv) と config.yaml を置換する。

CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  category TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entries_month ON entries(month);

CREATE TABLE bundle_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('subscriptions','communications')),
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  UNIQUE (kind, month, name)
);

CREATE TABLE category_groups (
  name TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL
);

CREATE TABLE categories (
  name TEXT PRIMARY KEY,
  group_name TEXT NOT NULL REFERENCES category_groups(name),
  income_owner TEXT CHECK (income_owner IN ('夫','妻')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE goals (
  name TEXT PRIMARY KEY,
  target_amount INTEGER NOT NULL CHECK (target_amount > 0),
  source TEXT NOT NULL DEFAULT 'savings' CHECK (source IN ('savings','net_worth')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE dashboard_months (
  month TEXT PRIMARY KEY CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]')
);
