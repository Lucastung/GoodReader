import { NextResponse } from "next/server";
import { getArticle, getSession, gradesInLastHour, saveAttemptAndGrade } from "@/lib/db";
import { gradeAttempt } from "@/lib/grader";
import { GRADES_PER_HOUR, checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";
import { SubmitAttemptInput } from "@/lib/schemas";
import { precheck } from "@/lib/textcheck";

/** 送出大綱與摘要 → 評分 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const { id } = await params;

  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const clientId = user.id;

  const parsed = SubmitAttemptInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "大綱或摘要格式錯誤");
  const { outline, summary } = parsed.data;

  const session = await getSession(env.DB, id);
  if (!session || session.client_id !== clientId) return jsonError(404, "找不到這次練習");
  const article = await getArticle(env.DB, session.article_id);
  if (!article) return jsonError(404, "文章已不存在");

  const pre = precheck(outline, summary);
  if (!pre.ok) return jsonError(422, pre.message);
  if ((await gradesInLastHour(env.DB, clientId)) >= GRADES_PER_HOUR)
    return jsonError(429, `每小時最多評分 ${GRADES_PER_HOUR} 次，請稍後再試`);

  let result;
  try {
    result = await gradeAttempt(env, article, session.grade, outline, summary);
  } catch (e) {
    console.error("grade failed", e);
    return jsonError(502, `評分失敗：${(e as Error).message}`);
  }

  const attemptId = crypto.randomUUID();
  const readSeconds = Math.round((Date.now() - Date.parse(session.started_at + "Z")) / 1000);
  await saveAttemptAndGrade(
    env.DB,
    { id: attemptId, sessionId: id, outlineJson: JSON.stringify(outline), summary, readSeconds },
    {
      id: crypto.randomUUID(),
      model: result.model,
      rubricVersion: result.rubricVersion,
      total: result.total,
      resultJson: JSON.stringify(result),
      latencyMs: result.usage.latencyMs,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
    },
  );

  return NextResponse.json({ attemptId, readSeconds, ...result });
}
