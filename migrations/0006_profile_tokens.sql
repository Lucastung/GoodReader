-- 個人資料（精簡：年級、一句自我介紹、頭像）與 Token 帳本

ALTER TABLE users ADD COLUMN grade_level TEXT;          -- j1 j2 j3（國一～國三）、s1 s2 s3（高一～高三）
ALTER TABLE users ADD COLUMN bio TEXT;                  -- 一句自我介紹，最多 60 字
ALTER TABLE users ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;  -- 0 = 沒有頭像；換頭像時 +1（讓瀏覽器快取失效）
ALTER TABLE users ADD COLUMN token_balance INTEGER NOT NULL DEFAULT 0;

-- 頭像：瀏覽器端已裁成 256×256 並重新編碼（去掉 EXIF／定位資訊），這裡存 base64
CREATE TABLE avatars (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  mime        TEXT NOT NULL,
  data_b64    TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Token 帳本：每一筆增減都記下來；users.token_balance 是目前餘額
CREATE TABLE token_ledger (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  delta          INTEGER NOT NULL,          -- 正數＝增加，負數＝扣除
  balance_after  INTEGER NOT NULL,
  reason         TEXT NOT NULL,             -- signup | grade | refund | admin | purchase
  ref            TEXT,                      -- 關聯：評分的 session id、購買的訂單編號…
  note           TEXT,
  created_by     TEXT,                      -- 管理者調整時記 email
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_token_ledger_user ON token_ledger(user_id, created_at);

-- 舊帳號一次補發註冊禮 100 Token
UPDATE users SET token_balance = token_balance + 100;
INSERT INTO token_ledger (id, user_id, delta, balance_after, reason, note)
  SELECT lower(hex(randomblob(16))), id, 100, token_balance, 'signup', '上線補發註冊禮' FROM users;
