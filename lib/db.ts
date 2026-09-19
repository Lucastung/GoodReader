import type { Grade, Keypoints, Paragraph } from "./schemas";

export type Article = {
  id: string;
  title: string;
  author: string;
  era: string | null;
  genre: string;
  difficulty: number;
  paragraphs: Paragraph[];
  charCount: number;
  url: string | null;
  license: string;
};

type ArticleRow = {
  id: string;
  title: string;
  author: string;
  era: string | null;
  genre: string;
  difficulty: number;
  paragraphs_json: string;
  char_count: number;
  url: string | null;
  license: string;
};

const toArticle = (r: ArticleRow): Article => ({
  id: r.id,
  title: r.title,
  author: r.author,
  era: r.era,
  genre: r.genre,
  difficulty: r.difficulty,
  paragraphs: JSON.parse(r.paragraphs_json),
  charCount: r.char_count,
  url: r.url,
  license: r.license,
});

const ARTICLE_COLS =
  "id, title, author, era, genre, difficulty, paragraphs_json, char_count, url, license";

/** 年級對應的難度範圍 */
export const DIFFICULTY_RANGE: Record<Grade, [number, number]> = { junior: [1, 3], senior: [3, 5] };

export async function getArticle(db: D1Database, id: string): Promise<Article | null> {
  const r = await db.prepare(`SELECT ${ARTICLE_COLS} FROM articles WHERE id = ?`).bind(id).first<ArticleRow>();
  return r ? toArticle(r) : null;
}

export async function pickArticle(
  db: D1Database,
  grade: Grade,
  genre?: string,
  excludeIds: string[] = [],
): Promise<Article | null> {
  const [lo, hi] = DIFFICULTY_RANGE[grade];
  const tries: [string, unknown[]][] = [];
  const genreSql = genre ? " AND genre = ?" : "";
  const genreArgs = genre ? [genre] : [];
  const excl = excludeIds.length ? ` AND id NOT IN (${excludeIds.map(() => "?").join(",")})` : "";
  // 先照年級難度 + 排除最近做過的；找不到再逐步放寬
  tries.push([`difficulty BETWEEN ? AND ?${genreSql}${excl}`, [lo, hi, ...genreArgs, ...excludeIds]]);
  tries.push([`difficulty BETWEEN ? AND ?${genreSql}`, [lo, hi, ...genreArgs]]);
  tries.push([`1=1${genreSql}`, genreArgs]);
  for (const [where, args] of tries) {
    const r = await db
      .prepare(`SELECT ${ARTICLE_COLS} FROM articles WHERE ${where} ORDER BY RANDOM() LIMIT 1`)
      .bind(...args)
      .first<ArticleRow>();
    if (r) return toArticle(r);
  }
  return null;
}

export async function listArticles(db: D1Database) {
  const { results } = await db
    .prepare("SELECT id, title, author, era, genre, difficulty, char_count FROM articles ORDER BY difficulty, title")
    .all<{ id: string; title: string; author: string; era: string | null; genre: string; difficulty: number; char_count: number }>();
  return results;
}

export async function recentArticleIds(db: D1Database, clientId: string, limit = 5): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT article_id FROM sessions WHERE client_id = ? ORDER BY started_at DESC LIMIT ?")
    .bind(clientId, limit)
    .all<{ article_id: string }>();
  return results.map((r) => r.article_id);
}

export async function createSession(
  db: D1Database,
  s: { id: string; clientId: string; articleId: string; grade: Grade },
) {
  await db
    .prepare("INSERT INTO sessions (id, client_id, article_id, grade) VALUES (?, ?, ?, ?)")
    .bind(s.id, s.clientId, s.articleId, s.grade)
    .run();
}

export type SessionRow = { id: string; client_id: string; article_id: string; grade: Grade; started_at: string };

export async function getSession(db: D1Database, id: string) {
  return db
    .prepare("SELECT id, client_id, article_id, grade, started_at FROM sessions WHERE id = ?")
    .bind(id)
    .first<SessionRow>();
}

export async function getKeypoints(db: D1Database, articleId: string): Promise<Keypoints | null> {
  const r = await db
    .prepare("SELECT data_json FROM article_keypoints WHERE article_id = ?")
    .bind(articleId)
    .first<{ data_json: string }>();
  return r ? JSON.parse(r.data_json) : null;
}

export async function saveKeypoints(db: D1Database, articleId: string, model: string, kp: Keypoints) {
  await db
    .prepare("INSERT OR REPLACE INTO article_keypoints (article_id, model, data_json) VALUES (?, ?, ?)")
    .bind(articleId, model, JSON.stringify(kp))
    .run();
}

export async function saveAttemptAndGrade(
  db: D1Database,
  a: { id: string; sessionId: string; outlineJson: string; summary: string; readSeconds: number },
  g: {
    id: string;
    model: string;
    rubricVersion: string;
    total: number;
    resultJson: string;
    latencyMs: number;
    tokensIn: number;
    tokensOut: number;
  },
) {
  await db.batch([
    db
      .prepare("INSERT INTO attempts (id, session_id, outline_json, summary, read_seconds) VALUES (?, ?, ?, ?, ?)")
      .bind(a.id, a.sessionId, a.outlineJson, a.summary, a.readSeconds),
    db
      .prepare(
        "INSERT INTO grades (id, attempt_id, model, rubric_version, total, result_json, latency_ms, tokens_in, tokens_out) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(g.id, a.id, g.model, g.rubricVersion, g.total, g.resultJson, g.latencyMs, g.tokensIn, g.tokensOut),
  ]);
}

export async function listAttempts(db: D1Database, sessionId: string) {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.submitted_at, g.total FROM attempts a JOIN grades g ON g.attempt_id = a.id
       WHERE a.session_id = ? ORDER BY a.submitted_at`,
    )
    .bind(sessionId)
    .all<{ id: string; submitted_at: string; total: number }>();
  return results;
}

/** 每個 client 每小時的評分次數（簡易限流） */
export async function gradesInLastHour(db: D1Database, clientId: string): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM attempts a JOIN sessions s ON s.id = a.session_id
       WHERE s.client_id = ? AND a.submitted_at > datetime('now', '-1 hour')`,
    )
    .bind(clientId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}
