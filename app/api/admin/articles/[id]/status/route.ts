import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/admin";
import { nextDraftId, setArticleStatus } from "@/lib/admin-db";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { ARTICLE_STATUSES } from "@/lib/schemas";

/** 審稿：draft → approved（上架）／archived（下架） */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const { id } = await params;
  const parsed = z.object({ status: z.enum(ARTICLE_STATUSES) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "狀態錯誤");
  if (!(await setArticleStatus(env.DB, id, parsed.data.status, a.email))) return jsonError(404, "找不到這篇文章");
  await audit(env.DB, a, `article.${parsed.data.status}`, id);
  // 上架後直接帶審稿老師到下一篇待審
  const nextDraft = parsed.data.status === "approved" ? await nextDraftId(env.DB, id) : null;
  return NextResponse.json({ ok: true, nextDraft });
}
