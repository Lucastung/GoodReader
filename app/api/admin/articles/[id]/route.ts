import { NextResponse } from "next/server";
import { audit } from "@/lib/admin";
import { adminArticle, updateArticle } from "@/lib/admin-db";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { ArticleInput } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const d = await adminArticle(env.DB, (await params).id);
  return d ? NextResponse.json(d) : jsonError(404, "找不到這篇文章");
}

export async function PUT(req: Request, { params }: Ctx) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const { id } = await params;
  const parsed = ArticleInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "參數錯誤");
  const r = await updateArticle(env.DB, id, parsed.data);
  if (!r) return jsonError(404, "找不到這篇文章");
  await audit(env.DB, a, "article.update", id, { textChanged: r.textChanged });
  return NextResponse.json({ ok: true, ...r });
}

/** 刪除：只有管理者，而且沒有學生做過才能刪；做過的請改成「下架」 */
export async function DELETE(req: Request, { params }: Ctx) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const { id } = await params;
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE article_id = ?").bind(id).first<{ n: number }>();
  if (used?.n) return jsonError(409, `已有 ${used.n} 次練習用過這篇，不能刪除，請改成下架`);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM article_keypoints WHERE article_id = ?").bind(id),
    env.DB.prepare("DELETE FROM article_quizzes WHERE article_id = ?").bind(id),
    env.DB.prepare("DELETE FROM article_reports WHERE article_id = ?").bind(id),
    env.DB.prepare("DELETE FROM articles WHERE id = ?").bind(id),
  ]);
  await audit(env.DB, a, "article.delete", id);
  return NextResponse.json({ ok: true });
}
