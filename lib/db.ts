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

/** 取文章。onlyApproved = 學生端開新練習時用，只給審核通過的 */
export async function getArticle(db: D1Database, id: string, onlyApproved = false): Promise<Article | null> {
  const r = await db
    .prepare(`SELECT ${ARTICLE_COLS} FROM articles WHERE id = ?${onlyApproved ? " AND status = 'approved'" : ""}`)
    .bind(id)
    .first<ArticleRow>();
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
  const genreSql = (genre ? " AND genre = ?" : "") + " AND status = 'approved'";
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
    .prepare("SELECT id, title, author, era, genre, difficulty, char_count FROM articles WHERE status = 'approved' ORDER BY difficulty, title")
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

// ---------- 首頁儀表板 ----------

export type Stats = {
  completed: number;
  byDifficulty: { difficulty: number; count: number; avg: number | null }[];
  totalPoints: number;
  redeemed: number;
  remaining: number;
};

/**
 * 每次練習（session）只取最高分，避免重複送出同一篇來刷分。
 * 總積分 = 各次練習最高分的總和；剩餘 = 總積分 − 已扣除。
 */
export async function getStats(db: D1Database, clientId: string): Promise<Stats> {
  const [rows, red] = await db.batch([
    db
      .prepare(
        `WITH best AS (
           SELECT s.id, a.difficulty, MAX(g.total) AS best
           FROM sessions s
           JOIN articles a ON a.id = s.article_id
           JOIN attempts t ON t.session_id = s.id
           JOIN grades g ON g.attempt_id = t.id
           WHERE s.client_id = ?
           GROUP BY s.id
         )
         SELECT difficulty, COUNT(*) AS n, AVG(best) AS avg, SUM(best) AS total FROM best GROUP BY difficulty`,
      )
      .bind(clientId),
    db.prepare("SELECT COALESCE(SUM(points), 0) AS redeemed FROM redemptions WHERE client_id = ?").bind(clientId),
  ]);
  const byD = new Map(
    (rows.results as { difficulty: number; n: number; avg: number; total: number }[]).map((r) => [r.difficulty, r]),
  );
  const byDifficulty = [1, 2, 3, 4, 5].map((d) => {
    const r = byD.get(d);
    return { difficulty: d, count: r?.n ?? 0, avg: r ? Math.round(r.avg) : null };
  });
  const completed = byDifficulty.reduce((n, r) => n + r.count, 0);
  const totalPoints = [...byD.values()].reduce((n, r) => n + r.total, 0);
  const redeemed = (red.results[0] as { redeemed: number }).redeemed;
  return { completed, byDifficulty, totalPoints, redeemed, remaining: totalPoints - redeemed };
}

export async function addRedemption(db: D1Database, clientId: string, points: number) {
  await db
    .prepare("INSERT INTO redemptions (id, client_id, points) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), clientId, points)
    .run();
}

export async function logUsage(
  db: D1Database,
  u: { kind: "keypoints" | "generate"; model: string; articleId?: string | null; tokensIn: number; tokensOut: number; latencyMs: number },
) {
  await db
    .prepare("INSERT INTO llm_usage (id, kind, model, article_id, tokens_in, tokens_out, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), u.kind, u.model, u.articleId ?? null, u.tokensIn, u.tokensOut, u.latencyMs)
    .run();
}
