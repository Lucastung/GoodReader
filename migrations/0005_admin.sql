-- 後台：角色、範文審稿、帳號停用、用量紀錄、設定、操作紀錄

-- 後台角色（登入由 Cloudflare Access 驗證 email；ADMIN_EMAILS 裡的 email 永遠是管理者）
CREATE TABLE admin_roles (
  email       TEXT PRIMARY KEY,               -- 一律小寫
  role        TEXT NOT NULL CHECK (role IN ('admin', 'reviewer')),
  note        TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 範文審稿：只有 approved 的文章會出現在學生端
ALTER TABLE articles ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';  -- draft | approved | archived
ALTER TABLE articles ADD COLUMN origin TEXT NOT NULL DEFAULT 'classic';   -- classic | ai | import | manual
ALTER TABLE articles ADD COLUMN notes TEXT;                               -- 審稿備註
ALTER TABLE articles ADD COLUMN created_by TEXT;
ALTER TABLE articles ADD COLUMN reviewed_by TEXT;
ALTER TABLE articles ADD COLUMN reviewed_at TEXT;
ALTER TABLE articles ADD COLUMN updated_at TEXT;
CREATE INDEX idx_articles_status ON articles(status, difficulty);

-- 停用帳號：不能登入，現有登入狀態失效
ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;

-- 評分以外的模型呼叫（要點底稿、AI 範文）也記下用量，算成本用
CREATE TABLE llm_usage (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,                  -- keypoints | generate
  model       TEXT NOT NULL,
  article_id  TEXT,
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  latency_ms  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_llm_usage_time ON llm_usage(created_at);
CREATE INDEX idx_grades_time ON grades(created_at);

-- 後台可調的設定（例如模型單價）
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- DeepInfra 標準方案單價（美元／百萬 tokens，2026-09 查詢），後台「統計」頁可改
INSERT INTO settings (key, value_json) VALUES (
  'llm_prices',
  '{"deepseek-ai/DeepSeek-V4-Flash":{"in":0.09,"out":0.18},"deepseek-ai/DeepSeek-V4-Pro":{"in":1.30,"out":2.60}}'
);

-- 後台操作紀錄
CREATE TABLE admin_audit (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_admin_audit_time ON admin_audit(created_at);
