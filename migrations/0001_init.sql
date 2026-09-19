-- 白名單來源（demo 階段先空著，之後由管理端新增）
CREATE TABLE sources (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  domain        TEXT NOT NULL,
  config_json   TEXT NOT NULL,          -- entryUrls, articleUrlPattern, selectors...
  license       TEXT NOT NULL,          -- public-domain | cc-by | cc-by-sa | user-only
  default_genre TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 文章（demo 內建經典文學；之後收集器抓到的公有領域文章也存這裡）
CREATE TABLE articles (
  id              TEXT PRIMARY KEY,
  source_id       TEXT,                 -- NULL = 內建文庫
  url             TEXT,
  title           TEXT NOT NULL,
  author          TEXT NOT NULL,
  era             TEXT,
  genre           TEXT NOT NULL,        -- 文言文 | 散文 | 記敘文 | 議論文 | 說明文
  difficulty      INTEGER NOT NULL,     -- 1..5
  paragraphs_json TEXT NOT NULL,        -- [{"id":"P1","text":"..."}]
  char_count      INTEGER NOT NULL,
  license         TEXT NOT NULL DEFAULT 'public-domain',
  expires_at      TEXT,                 -- 有值 = 到期要清正文（有版權來源用）
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_articles_genre ON articles(genre, difficulty);

-- 每篇文章的要點底稿（LLM 產生一次後快取）
CREATE TABLE article_keypoints (
  article_id  TEXT PRIMARY KEY REFERENCES articles(id),
  model       TEXT NOT NULL,
  data_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 一次練習（demo 無登入，以瀏覽器產生的 client_id 區分）
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  article_id  TEXT NOT NULL REFERENCES articles(id),
  grade       TEXT NOT NULL,            -- junior | senior
  mode        TEXT NOT NULL DEFAULT 'open',
  started_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_client ON sessions(client_id, started_at);

CREATE TABLE attempts (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  outline_json  TEXT NOT NULL,
  summary       TEXT NOT NULL,
  read_seconds  INTEGER,
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE grades (
  id              TEXT PRIMARY KEY,
  attempt_id      TEXT NOT NULL UNIQUE REFERENCES attempts(id),
  model           TEXT NOT NULL,
  rubric_version  TEXT NOT NULL,
  total           INTEGER NOT NULL,
  result_json     TEXT NOT NULL,
  latency_ms      INTEGER,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
