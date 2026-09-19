import { NextResponse } from "next/server";
import { audit } from "@/lib/admin";
import { getArticle } from "@/lib/db";
import { ensureKeypoints } from "@/lib/grader";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";

/** 產生（或重算）要點底稿，讓審稿老師先檢查 AI 認為的重點對不對 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const { id } = await params;
  const article = await getArticle(env.DB, id);
  if (!article) return jsonError(404, "找不到這篇文章");
  try {
    const kp = await ensureKeypoints(env, article, true);
    await audit(env.DB, a, "article.keypoints", id);
    return NextResponse.json({ keypoints: kp });
  } catch (e) {
    return jsonError(502, `產生失敗：${(e as Error).message}`);
  }
}
