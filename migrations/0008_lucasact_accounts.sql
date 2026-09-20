-- 改用 lucasact 帳號服務（accounts.lucasact.com）：
--   登入（Google／Facebook）、Token 錢包都由 accounts 管；暱稱＋PIN、家長 PIN、本地 Token 帳本全部拿掉。
--   users 改成好好讀書自己的個人設定（年級、自我介紹、頭像），id 就是 accounts 的使用者 id，第一次進來時建立。
--   舊帳號都是測試帳號，連同作答紀錄一起清掉；範文、要點、題目、後台設定都保留。

-- 作答紀錄（有外鍵，由下往上刪）
DELETE FROM grades;
DELETE FROM attempts;
DELETE FROM quiz_attempts;
DELETE FROM sessions;
DELETE FROM redemptions;

-- 舊的帳號相關表
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS auth_failures;
DROP TABLE IF EXISTS token_ledger;
DROP TABLE IF EXISTS avatars;
DROP TABLE IF EXISTS users;

-- 好好讀書的個人設定
CREATE TABLE users (
  id              TEXT PRIMARY KEY,             -- accounts 的使用者 id
  name            TEXT NOT NULL DEFAULT '',     -- 顯示名稱（accounts 的，每次進來更新；後台列表用）
  avatar_url      TEXT NOT NULL DEFAULT '',     -- Google／Facebook 頭像（accounts 的，每次進來更新）
  grade_level     TEXT,                         -- j1 j2 j3（國一～國三）、s1 s2 s3（高一～高三）
  bio             TEXT,                         -- 一句自我介紹，最多 60 字
  avatar_version  INTEGER NOT NULL DEFAULT 0,   -- 自己在好好讀書上傳的頭像；0＝沒有（用 avatar_url）
  disabled        INTEGER NOT NULL DEFAULT 0,   -- 好好讀書這邊停用（整個帳號停用在 accounts）
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_seen ON users(last_seen_at);

CREATE TABLE avatars (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  mime        TEXT NOT NULL,
  data_b64    TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
