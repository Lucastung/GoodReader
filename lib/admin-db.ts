// 後台用的 D1 查詢
import { getStats } from "./db";
import type { ArticleInputT } from "./schemas";
import { countHan } from "./textcheck";

// ---------- 帳戶 ----------

export type AdminUserRow = {
  id: string;
  nickname: string;
  created_at: string;
  disabled: number;
  has_parent_pin: number;
  done: number;
  points: number;
  redeemed: number;
  last_active: string | null;
};

export async function listUsers(db: D1Database, q: string, limit: number, offset: number) {
  const like = `%${q.trim().toLowerCase().replace(/[%_]/g, "")}%`;
  const [rows, count] = await db.batch([
    db
      .prepare(
        `WITH best AS (
           SELECT s.client_id, s.id, MAX(g.total) AS best, MAX(t.submitted_at) AS last
           FROM sessions s JOIN attempts t ON t.session_id = s.id JOIN grades g ON g.attempt_id = t.id
           GROUP BY s.id
         ),
         agg AS (SELECT client_id, COUNT(*) AS done, SUM(best) AS pts, MAX(last) AS last FROM best GROUP BY client_id),
         red AS (SELECT client_id, SUM(points) AS redeemed FROM redemptions GROUP BY client_id)
         SELECT u.id, u.nickname, u.created_at, u.disabled, (u.parent_pin_hash IS NOT NULL) AS has_parent_pin,
                COALESCE(agg.done, 0) AS done, COALESCE(agg.pts, 0) AS points,
                COALESCE(red.redeemed, 0) AS redeemed, agg.last AS last_active
         FROM users u LEFT JOIN agg ON agg.client_id = u.id LEFT JOIN red ON red.client_id = u.id
         WHERE u.nickname_key LIKE ?
         ORDER BY COALESCE(agg.last, u.created_at) DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(like, limit, offset),
    db.prepare("SELECT COUNT(*) AS n FROM users WHERE nickname_key LIKE ?").bind(like),
  ]);
  return { users: rows.results as AdminUserRow[], total: (count.results[0] as { n: number }).n };
}

export async function userDetail(db: D1Database, id: string) {
  const user = await db
    .prepare(
      "SELECT id, nickname, created_at, disabled, (parent_pin_hash IS NOT NULL) AS has_parent_pin FROM users WHERE id = ?",
    )
    .bind(id)
    .first<{ id: string; nickname: string; created_at: string; disabled: number; has_parent_pin: number }>();
  if (!user) return null;
  const [sessions, redemptions, logins] = await db.batch([
    db
      .prepare(
        `SELECT s.id, s.started_at, s.grade, a.title, a.difficulty,
                COUNT(t.id) AS attempts, MAX(g.total) AS best
         FROM sessions s JOIN articles a ON a.id = s.article_id
         LEFT JOIN attempts t ON t.session_id = s.id LEFT JOIN grades g ON g.attempt_id = t.id
         WHERE s.client_id = ? GROUP BY s.id ORDER BY s.started_at DESC LIMIT 50`,
      )
      .bind(id),
    db.prepare("SELECT id, points, created_at FROM redemptions WHERE client_id = ? ORDER BY created_at DESC LIMIT 50").bind(id),
    db
      .prepare("SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id = ? AND expires_at > datetime('now')")
      .bind(id),
  ]);
  return {
    user,
    stats: await getStats(db, id),
    sessions: sessions.results,
    redemptions: redemptions.results,
    activeLogins: (logins.results[0] as { n: number }).n,
  };
}

// ---------- 範文 ----------

export type AdminArticleRow = {
  id: string;
  title: string;
  author: string;
  era: string | null;
  genre: string;
  difficulty: number;
  char_count: number;
  status: string;
  origin: string;
  license: string;
  created_at: string;
  updated_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sessions: number;
  avg_best: number | null;
};

export async function listAdminArticles(db: D1Database, f: { status?: string; q?: string; genre?: string }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.status) {
    where.push("a.status = ?");
    args.push(f.status);
  }
  if (f.genre) {
    where.push("a.genre = ?");
    args.push(f.genre);
  }
  if (f.q?.trim()) {
    where.push("(a.title LIKE ? OR a.author LIKE ?)");
    const like = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    args.push(like, like);
  }
  const { results } = await db
    .prepare(
      `WITH best AS (
         SELECT s.article_id, s.id, MAX(g.total) AS best
         FROM sessions s JOIN attempts t ON t.session_id = s.id JOIN grades g ON g.attempt_id = t.id GROUP BY s.id
       ),
       agg AS (SELECT article_id, COUNT(*) AS n, AVG(best) AS avg_best FROM best GROUP BY article_id)
       SELECT a.id, a.title, a.author, a.era, a.genre, a.difficulty, a.char_count, a.status, a.origin, a.license,
              a.created_at, a.updated_at, a.reviewed_by, a.reviewed_at,
              COALESCE(agg.n, 0) AS sessions, agg.avg_best
       FROM articles a LEFT JOIN agg ON agg.article_id = a.id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY CASE a.status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, a.difficulty, a.title
       LIMIT 500`,
    )
    .bind(...args)
    .all<AdminArticleRow>();
  const counts = await db
    .prepare("SELECT status, COUNT(*) AS n FROM articles GROUP BY status")
    .all<{ status: string; n: number }>();
  return { articles: results, counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])) };
}

export async function adminArticle(db: D1Database, id: string) {
  const a = await db
    .prepare(
      `SELECT id, title, author, era, genre, difficulty, paragraphs_json, char_count, url, license, status, origin, notes,
              created_by, created_at, updated_at, reviewed_by, reviewed_at
       FROM articles WHERE id = ?`,
    )
    .bind(id)
    .first<Record<string, unknown> & { paragraphs_json: string }>();
  if (!a) return null;
  const kp = await db
    .prepare("SELECT model, data_json, created_at FROM article_keypoints WHERE article_id = ?")
    .bind(id)
    .first<{ model: string; data_json: string; created_at: string }>();
  const used = await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE article_id = ?").bind(id).first<{ n: number }>();
  const { paragraphs_json, ...rest } = a;
  return {
    article: { ...rest, paragraphs: (JSON.parse(paragraphs_json) as { text: string }[]).map((p) => p.text) },
    keypoints: kp ? { model: kp.model, createdAt: kp.created_at, data: JSON.parse(kp.data_json) } : null,
    sessions: used?.n ?? 0,
  };
}

const toParagraphs = (ps: string[]) =>
  ps.map((t) => t.trim()).filter(Boolean).map((text, i) => ({ id: `P${i + 1}`, text }));

/** 由標題產生 id；中文標題就用隨機碼 */
export function articleIdFor(title: string) {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return `${ascii || "a"}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function insertArticle(
  db: D1Database,
  a: ArticleInputT & { id?: string },
  meta: { origin: string; createdBy: string; status?: string },
) {
  const id = a.id || articleIdFor(a.title);
  const paragraphs = toParagraphs(a.paragraphs);
  await db
    .prepare(
      `INSERT INTO articles (id, source_id, url, title, author, era, genre, difficulty, paragraphs_json, char_count,
                             license, status, origin, notes, created_by, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      id,
      a.url || null,
      a.title,
      a.author,
      a.era || null,
      a.genre,
      a.difficulty,
      JSON.stringify(paragraphs),
      paragraphs.reduce((n, p) => n + countHan(p.text), 0),
      a.license,
      meta.status ?? "draft",
      meta.origin,
      a.notes ?? null,
      meta.createdBy,
    )
    .run();
  return id;
}

/** 更新文章；正文有改就清掉要點底稿，下次評分重算 */
export async function updateArticle(db: D1Database, id: string, a: ArticleInputT) {
  const old = await db.prepare("SELECT paragraphs_json FROM articles WHERE id = ?").bind(id).first<{ paragraphs_json: string }>();
  if (!old) return false;
  const paragraphs = toParagraphs(a.paragraphs);
  const json = JSON.stringify(paragraphs);
  const stmts = [
    db
      .prepare(
        `UPDATE articles SET title = ?, author = ?, era = ?, genre = ?, difficulty = ?, paragraphs_json = ?, char_count = ?,
                url = ?, license = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(
        a.title,
        a.author,
        a.era || null,
        a.genre,
        a.difficulty,
        json,
        paragraphs.reduce((n, p) => n + countHan(p.text), 0),
        a.url || null,
        a.license,
        a.notes ?? null,
        id,
      ),
  ];
  const textChanged = json !== old.paragraphs_json;
  if (textChanged) stmts.push(db.prepare("DELETE FROM article_keypoints WHERE article_id = ?").bind(id));
  await db.batch(stmts);
  return { textChanged };
}

export async function setArticleStatus(db: D1Database, id: string, status: string, by: string) {
  const r = await db
    .prepare(
      `UPDATE articles SET status = ?, updated_at = datetime('now'),
         reviewed_by = CASE WHEN ? = 'approved' THEN ? ELSE reviewed_by END,
         reviewed_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE reviewed_at END
       WHERE id = ?`,
    )
    .bind(status, status, by, status, id)
    .run();
  return r.meta.changes > 0;
}

// ---------- 用量與成本 ----------

export type Prices = Record<string, { in: number; out: number }>;

export async function getPrices(db: D1Database): Promise<Prices> {
  const r = await db.prepare("SELECT value_json FROM settings WHERE key = 'llm_prices'").first<{ value_json: string }>();
  return r ? JSON.parse(r.value_json) : {};
}

export async function setPrices(db: D1Database, prices: Prices, by: string) {
  await db
    .prepare(
      `INSERT INTO settings (key, value_json, updated_by, updated_at) VALUES ('llm_prices', ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .bind(JSON.stringify(prices), by)
    .run();
}

export const costOf = (p: Prices, model: string, tin: number, tout: number) => {
  const m = p[model];
  return m ? (tin * m.in + tout * m.out) / 1e6 : 0;
};

type DayRow = { day: string; kind: string; model: string; calls: number; tin: number; tout: number; latency: number | null };

/** 最近 N 天（UTC+8 分日）每日的評分次數、活躍學生、新帳號、tokens 與成本 */
export async function usageStats(db: D1Database, days: number) {
  const since = `-${days} days`;
  const tz = "+8 hours";
  const [llm, active, signups, totals, topUsers, topArticles] = await db.batch([
    db
      .prepare(
        `SELECT date(created_at, '${tz}') AS day, 'grade' AS kind, model, COUNT(*) AS calls,
                COALESCE(SUM(tokens_in), 0) AS tin, COALESCE(SUM(tokens_out), 0) AS tout, AVG(latency_ms) AS latency
         FROM grades WHERE created_at > datetime('now', ?) GROUP BY day, model
         UNION ALL
         SELECT date(created_at, '${tz}') AS day, kind, model, COUNT(*) AS calls,
                SUM(tokens_in) AS tin, SUM(tokens_out) AS tout, AVG(latency_ms) AS latency
         FROM llm_usage WHERE created_at > datetime('now', ?) GROUP BY day, kind, model`,
      )
      .bind(since, since),
    db
      .prepare(
        `SELECT date(t.submitted_at, '${tz}') AS day, COUNT(DISTINCT s.client_id) AS n
         FROM attempts t JOIN sessions s ON s.id = t.session_id
         WHERE t.submitted_at > datetime('now', ?) GROUP BY day`,
      )
      .bind(since),
    db
      .prepare(`SELECT date(created_at, '${tz}') AS day, COUNT(*) AS n FROM users WHERE created_at > datetime('now', ?) GROUP BY day`)
      .bind(since),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM users WHERE disabled = 1) AS disabled,
              (SELECT COUNT(*) FROM grades) AS grades,
              (SELECT COUNT(*) FROM articles WHERE status = 'approved') AS approved,
              (SELECT COUNT(*) FROM articles WHERE status = 'draft') AS drafts`,
    ),
    db
      .prepare(
        `SELECT u.nickname, COUNT(*) AS n FROM attempts t JOIN sessions s ON s.id = t.session_id JOIN users u ON u.id = s.client_id
         WHERE t.submitted_at > datetime('now', ?) GROUP BY u.id ORDER BY n DESC LIMIT 10`,
      )
      .bind(since),
    db
      .prepare(
        `SELECT a.title, COUNT(*) AS n FROM attempts t JOIN sessions s ON s.id = t.session_id JOIN articles a ON a.id = s.article_id
         WHERE t.submitted_at > datetime('now', ?) GROUP BY a.id ORDER BY n DESC LIMIT 10`,
      )
      .bind(since),
  ]);
  return {
    llm: llm.results as DayRow[],
    active: active.results as { day: string; n: number }[],
    signups: signups.results as { day: string; n: number }[],
    totals: totals.results[0] as { users: number; disabled: number; grades: number; approved: number; drafts: number },
    topUsers: topUsers.results as { nickname: string; n: number }[],
    topArticles: topArticles.results as { title: string; n: number }[],
  };
}
