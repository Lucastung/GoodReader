import type { Grade, Keypoints, Mode, Paragraph } from "./schemas.ts";

export type Article = {
  id: string;
  title: string;
  author: string;
  era: string | null;
  genre: string;
  series: string | null;
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
  series: string | null;
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
  series: r.series,
  difficulty: r.difficulty,
  paragraphs: JSON.parse(r.paragraphs_json),
  charCount: r.char_count,
  url: r.url,
  license: r.license,
});

const ARTICLE_COLS =
  "id, title, author, era, genre, series, difficulty, paragraphs_json, char_count, url, license";

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
  series?: string,
): Promise<Article | null> {
  const [lo, hi] = DIFFICULTY_RANGE[grade];
  const tries: [string, unknown[]][] = [];
  // 系列與文體都是讀者主動挑的，放寬時只放寬難度與「最近做過」，不會換到別的系列或文體
  const seriesSql = series ? " AND series = ?" : "";
  const seriesArgs = series ? [series] : [];
  const genreSql = (genre ? " AND genre = ?" : "") + seriesSql + " AND status = 'approved'";
  const genreArgs = [...(genre ? [genre] : []), ...seriesArgs];
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
    .prepare(
      "SELECT id, title, author, era, genre, series, difficulty, char_count FROM articles WHERE status = 'approved' ORDER BY difficulty, title",
    )
    .all<{
      id: string;
      title: string;
      author: string;
      era: string | null;
      genre: string;
      series: string | null;
      difficulty: number;
      char_count: number;
    }>();
  return results;
}

/** 已上架文章用到的系列清單（依篇數多寡排序），給首頁的系列選單用 */
export async function listSeries(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT series, COUNT(*) AS n FROM articles WHERE status = 'approved' AND series IS NOT NULL AND series <> '' GROUP BY series ORDER BY n DESC, series",
    )
    .all<{ series: string; n: number }>();
  return results.map((r) => r.series);
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
  s: { id: string; clientId: string; articleId: string; grade: Grade; mode: Mode; quizJson?: string | null },
) {
  await db
    .prepare("INSERT INTO sessions (id, client_id, article_id, grade, mode, quiz_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(s.id, s.clientId, s.articleId, s.grade, s.mode, s.quizJson ?? null)
    .run();
}

export type SessionRow = {
  id: string;
  client_id: string;
  article_id: string;
  grade: Grade;
  mode: Mode;
  quiz_json: string | null;
  started_at: string;
};

export async function getSession(db: D1Database, id: string) {
  const r = await db
    .prepare("SELECT id, client_id, article_id, grade, mode, quiz_json, started_at FROM sessions WHERE id = ?")
    .bind(id)
    .first<SessionRow>();
  // 舊資料的 mode 是 'open'，一律視為進階
  return r ? { ...r, mode: r.mode === "basic" ? "basic" : "advanced" } as SessionRow : null;
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

/**
 * 每位學生每篇文章、每種模式的成績（SQL CTE 片段，名稱 best_all）：
 * - 進階（大綱＋摘要，滿分 100）：這篇所有練習中的最高分，重做只補差額
 * - 基礎（閱讀測驗，滿分 25）：只能作答一次，就是那次的分數
 * 總積分 = 兩種模式各篇成績的總和。
 */
export const BEST_CTE = `best_all AS (
  SELECT s.client_id, s.article_id, 'advanced' AS mode, MAX(g.total) AS best, MAX(t.submitted_at) AS last
  FROM sessions s JOIN attempts t ON t.session_id = s.id JOIN grades g ON g.attempt_id = t.id
  GROUP BY s.client_id, s.article_id
  UNION ALL
  SELECT client_id, article_id, 'basic' AS mode, score AS best, submitted_at AS last FROM quiz_attempts
)`;

export type DifficultyStat = { difficulty: number; count: number; avg: number | null };

export type Stats = {
  completed: number;
  /** 進階：各難度平均分（滿分 100） */
  byDifficulty: DifficultyStat[];
  /** 基礎：各難度平均分（滿分 25） */
  byDifficultyBasic: DifficultyStat[];
  totalPoints: number;
  redeemed: number;
  remaining: number;
};

export async function getStats(db: D1Database, clientId: string): Promise<Stats> {
  const [rows, red] = await db.batch([
    db
      .prepare(
        `WITH ${BEST_CTE}
         SELECT a.difficulty, b.mode, COUNT(*) AS n, AVG(b.best) AS avg, SUM(b.best) AS total
         FROM best_all b JOIN articles a ON a.id = b.article_id
         WHERE b.client_id = ?
         GROUP BY a.difficulty, b.mode`,
      )
      .bind(clientId),
    db.prepare("SELECT COALESCE(SUM(points), 0) AS redeemed FROM redemptions WHERE client_id = ?").bind(clientId),
  ]);
  const list = rows.results as { difficulty: number; mode: string; n: number; avg: number; total: number }[];
  const series = (mode: string) => {
    const byD = new Map(list.filter((r) => r.mode === mode).map((r) => [r.difficulty, r]));
    return [1, 2, 3, 4, 5].map((d) => {
      const r = byD.get(d);
      return { difficulty: d, count: r?.n ?? 0, avg: r ? Math.round(r.avg) : null };
    });
  };
  const byDifficulty = series("advanced");
  const byDifficultyBasic = series("basic");
  const completed = list.reduce((n, r) => n + r.n, 0);
  const totalPoints = list.reduce((n, r) => n + r.total, 0);
  const redeemed = (red.results[0] as { redeemed: number }).redeemed;
  return { completed, byDifficulty, byDifficultyBasic, totalPoints, redeemed, remaining: totalPoints - redeemed };
}

export async function addRedemption(db: D1Database, clientId: string, points: number) {
  await db
    .prepare("INSERT INTO redemptions (id, client_id, points) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), clientId, points)
    .run();
}

export async function logUsage(
  db: D1Database,
  u: { kind: "keypoints" | "generate" | "quiz"; model: string; articleId?: string | null; tokensIn: number; tokensOut: number; latencyMs: number },
) {
  await db
    .prepare("INSERT INTO llm_usage (id, kind, model, article_id, tokens_in, tokens_out, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), u.kind, u.model, u.articleId ?? null, u.tokensIn, u.tokensOut, u.latencyMs)
    .run();
}

/** 這個學生每篇文章的成績（文章清單打勾用）：advanced = 進階最高分，basic = 閱讀測驗分數 */
export async function articleBests(
  db: D1Database,
  clientId: string,
): Promise<Record<string, { advanced?: number; basic?: number }>> {
  const { results } = await db
    .prepare(`WITH ${BEST_CTE} SELECT article_id, mode, best FROM best_all WHERE client_id = ?`)
    .bind(clientId)
    .all<{ article_id: string; mode: "advanced" | "basic"; best: number }>();
  const out: Record<string, { advanced?: number; basic?: number }> = {};
  for (const r of results) (out[r.article_id] ??= {})[r.mode] = r.best;
  return out;
}

/** 同一篇文章在「其他」進階練習裡的最高分（練習頁提醒不會重複計分用） */
export async function previousBest(db: D1Database, clientId: string, articleId: string, excludeSessionId: string) {
  const r = await db
    .prepare(
      `SELECT MAX(g.total) AS best
       FROM sessions s JOIN attempts t ON t.session_id = s.id JOIN grades g ON g.attempt_id = t.id
       WHERE s.client_id = ? AND s.article_id = ? AND s.id != ?`,
    )
    .bind(clientId, articleId, excludeSessionId)
    .first<{ best: number | null }>();
  return r?.best ?? null;
}
