-- 基礎模式：閱讀測驗（每篇 5 題四選一，一題 5 分，每位學生每篇只能作答一次）

-- 每篇文章的題目（第一次有人練習時由 LLM 產生並快取；後台可檢查、修改、重新出題）
CREATE TABLE article_quizzes (
  article_id  TEXT PRIMARY KEY REFERENCES articles(id),
  model       TEXT NOT NULL,                 -- 產生的模型；老師改過後仍保留
  data_json   TEXT NOT NULL,                 -- {"questions":[{q, options[4], answer, explanation, paragraph, skill}]}
  edited_by   TEXT,                          -- 後台修改者 email；NULL = AI 原稿
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 作答紀錄：存下當時的題目快照，之後老師改題也不影響成績與解析
CREATE TABLE quiz_attempts (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL UNIQUE REFERENCES sessions(id),
  client_id       TEXT NOT NULL,
  article_id      TEXT NOT NULL REFERENCES articles(id),
  questions_json  TEXT NOT NULL,
  answers_json    TEXT NOT NULL,             -- 學生選的選項索引 [0..3]
  correct         INTEGER NOT NULL,
  score           INTEGER NOT NULL,
  read_seconds    INTEGER,
  submitted_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, article_id)             -- 每篇只能作答一次
);
CREATE INDEX idx_quiz_attempts_client ON quiz_attempts(client_id, submitted_at);

-- 基礎模式開始練習時，把當下的題目存進 session，交卷就依這份計分（老師中途改題不影響作答中的學生）
ALTER TABLE sessions ADD COLUMN quiz_json TEXT;

-- sessions.mode：basic（閱讀測驗）| advanced（大綱＋摘要）；舊資料都是 advanced
UPDATE sessions SET mode = 'advanced' WHERE mode = 'open';
