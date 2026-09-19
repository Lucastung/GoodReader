import { NextResponse } from "next/server";
import { getArticle, getSession, listAttempts } from "@/lib/db";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";
import { suggestedSummaryRange } from "@/lib/textcheck";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const { id } = await params;
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const clientId = user.id;

  const session = await getSession(env.DB, id);
  if (!session || session.client_id !== clientId) return jsonError(404, "找不到這次練習");
  const article = await getArticle(env.DB, session.article_id);
  if (!article) return jsonError(404, "文章已不存在");

  return NextResponse.json({
    sessionId: session.id,
    grade: session.grade,
    startedAt: session.started_at,
    article,
    summaryRange: suggestedSummaryRange(article.charCount),
    attempts: await listAttempts(env.DB, id),
  });
}
