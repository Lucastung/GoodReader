import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { createSession, getArticle, pickArticle, recentArticleIds } from "@/lib/db";
import { ensureKeypoints } from "@/lib/grader";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";
import { StartSessionInput } from "@/lib/schemas";
import { suggestedSummaryRange } from "@/lib/textcheck";
import { GRADE_COST } from "@/lib/tokens";

/** 抽一篇文章並開始練習 */
export async function POST(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;

  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const clientId = user.id;
  if (user.tokens < GRADE_COST) return jsonError(402, `Token 不足：每次評分需要 ${GRADE_COST} 個 Token`);

  const parsed = StartSessionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "參數錯誤");
  const { grade, genre, articleId } = parsed.data;

  const article = articleId
    ? await getArticle(env.DB, articleId, true)
    : await pickArticle(env.DB, grade, genre, await recentArticleIds(env.DB, clientId));
  if (!article) return jsonError(404, "找不到符合條件的文章");

  const sessionId = crypto.randomUUID();
  await createSession(env.DB, { id: sessionId, clientId, articleId: article.id, grade });

  // 學生閱讀的同時，在背景先產生要點底稿，送出時就不用等
  getCloudflareContext().ctx.waitUntil(ensureKeypoints(env, article).catch((e) => console.error("keypoints", e)));

  return NextResponse.json({
    sessionId,
    grade,
    article,
    summaryRange: suggestedSummaryRange(article.charCount),
  });
}
