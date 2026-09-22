-- 系列：讓讀者可以挑自己有興趣的主題系列來讀（例如「釣魚」）
ALTER TABLE articles ADD COLUMN series TEXT;
CREATE INDEX idx_articles_series ON articles(series, difficulty);
