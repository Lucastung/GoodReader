-- 學生檢舉／回報文章問題：內容錯誤（錯字、題目或解析有誤）、版權問題。後台「檢舉」頁處理。
CREATE TABLE article_reports (
  id           TEXT PRIMARY KEY,
  article_id   TEXT NOT NULL REFERENCES articles(id),
  user_id      TEXT NOT NULL,                 -- 回報的學生（accounts 的使用者 id）
  kind         TEXT NOT NULL,                 -- content | copyright
  paragraph    TEXT,                          -- 選填：問題在哪一段，例如 P3
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',  -- open | resolved（已處理）| dismissed（不處理）
  handled_by   TEXT,                          -- 後台處理者 email
  handled_at   TEXT,
  handle_note  TEXT,                          -- 處理說明（學生看不到）
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reports_status ON article_reports(status, created_at);
CREATE INDEX idx_reports_article ON article_reports(article_id, status);
CREATE INDEX idx_reports_user ON article_reports(user_id, created_at);
