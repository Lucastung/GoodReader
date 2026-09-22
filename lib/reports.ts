// 文章檢舉：學生在文章下方回報內容錯誤或版權問題，後台「檢舉」頁列出來處理。
import { z } from "zod";

export const REPORT_KINDS = ["content", "copyright"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_KIND_LABEL: Record<ReportKind, string> = { content: "內容錯誤", copyright: "版權問題" };

export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = { open: "未處理", resolved: "已處理", dismissed: "不處理" };

/** 每位學生 24 小時內最多回報幾則，避免洗版 */
export const REPORTS_PER_DAY = 10;

export const ReportInput = z.object({
  kind: z.enum(REPORT_KINDS),
  paragraph: z
    .string()
    .regex(/^P\d{1,2}$/, "段落編號錯誤")
    .nullable()
    .optional(),
  message: z.string().trim().min(5, "請多寫一點，至少 5 個字").max(500, "最多 500 字"),
});
export type ReportInputT = z.infer<typeof ReportInput>;

export const HandleReportInput = z.object({
  status: z.enum(REPORT_STATUSES),
  note: z.string().trim().max(500).nullable().optional(),
});

export type CreateResult = { ok: true; id: string } | { ok: false; status: number; error: string };

export async function createReport(db: D1Database, userId: string, articleId: string, input: ReportInputT): Promise<CreateResult> {
  const art = await db
    .prepare("SELECT status, paragraphs_json FROM articles WHERE id = ?")
    .bind(articleId)
    .first<{ status: string; paragraphs_json: string }>();
  if (!art) return { ok: false, status: 404, error: "找不到這篇文章" };
  if (input.paragraph) {
    const n = (JSON.parse(art.paragraphs_json) as unknown[]).length;
    if (Number(input.paragraph.slice(1)) < 1 || Number(input.paragraph.slice(1)) > n) return { ok: false, status: 400, error: "沒有這個段落" };
  }
  const dup = await db
    .prepare("SELECT 1 FROM article_reports WHERE user_id = ? AND article_id = ? AND kind = ? AND status = 'open'")
    .bind(userId, articleId, input.kind)
    .first();
  if (dup) return { ok: false, status: 409, error: "你已經回報過這篇的這類問題，老師處理中，謝謝你！" };
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM article_reports WHERE user_id = ? AND created_at > datetime('now', '-1 day')")
    .bind(userId)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= REPORTS_PER_DAY) return { ok: false, status: 429, error: "今天回報的次數已經很多了，明天再來吧" };
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO article_reports (id, article_id, user_id, kind, paragraph, message) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, articleId, userId, input.kind, input.paragraph ?? null, input.message)
    .run();
  return { ok: true, id };
}

export type ReportRow = {
  id: string;
  article_id: string;
  article_title: string | null;
  article_status: string | null;
  user_id: string;
  user_name: string | null;
  kind: ReportKind;
  paragraph: string | null;
  message: string;
  status: ReportStatus;
  handled_by: string | null;
  handled_at: string | null;
  handle_note: string | null;
  created_at: string;
};

export async function listReports(db: D1Database, f: { status?: string; articleId?: string; kind?: string }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.status) {
    where.push("r.status = ?");
    args.push(f.status);
  }
  if (f.kind) {
    where.push("r.kind = ?");
    args.push(f.kind);
  }
  if (f.articleId) {
    where.push("r.article_id = ?");
    args.push(f.articleId);
  }
  const { results } = await db
    .prepare(
      `SELECT r.*, a.title AS article_title, a.status AS article_status, u.name AS user_name
       FROM article_reports r LEFT JOIN articles a ON a.id = r.article_id LEFT JOIN users u ON u.id = r.user_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY r.created_at DESC LIMIT 300`,
    )
    .bind(...args)
    .all<ReportRow>();
  // 分頁籤的數字：套用文章篩選，但不套狀態
  const counts = await db
    .prepare(`SELECT status, COUNT(*) AS n FROM article_reports ${f.articleId ? "WHERE article_id = ?" : ""} GROUP BY status`)
    .bind(...(f.articleId ? [f.articleId] : []))
    .all<{ status: string; n: number }>();
  return { reports: results, counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])) as Record<string, number> };
}

export async function handleReport(db: D1Database, id: string, status: ReportStatus, by: string, note?: string | null) {
  const r = await db
    .prepare(
      `UPDATE article_reports SET status = ?,
         handled_by = CASE WHEN ? = 'open' THEN NULL ELSE ? END,
         handled_at = CASE WHEN ? = 'open' THEN NULL ELSE datetime('now') END,
         handle_note = ?
       WHERE id = ?`,
    )
    .bind(status, status, by, status, note?.trim() || null, id)
    .run();
  return r.meta.changes > 0;
}
