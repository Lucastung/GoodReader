-- 學生帳號（暱稱＋PIN）與家長 PIN
CREATE TABLE users (
  id               TEXT PRIMARY KEY,
  nickname         TEXT NOT NULL,
  nickname_key     TEXT NOT NULL UNIQUE,      -- 小寫、去空白，用來查重與登入
  pin_hash         TEXT NOT NULL,
  pin_salt         TEXT NOT NULL,
  parent_pin_hash  TEXT,                      -- 第一次扣除時由家長設定
  parent_pin_salt  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 登入狀態：瀏覽器只拿到隨機 token（HttpOnly cookie），這裡存它的 SHA-256
CREATE TABLE auth_sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

-- PIN 錯誤紀錄，用來鎖定暴力猜測（15 分鐘內錯 5 次就暫停）
CREATE TABLE auth_failures (
  key         TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_auth_failures_key ON auth_failures(key, created_at);
