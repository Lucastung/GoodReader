-- 積分折現紀錄：每次「扣除」寫一筆
CREATE TABLE redemptions (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  points      INTEGER NOT NULL CHECK (points > 0),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_redemptions_client ON redemptions(client_id);
