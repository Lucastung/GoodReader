import { NextResponse } from "next/server";
import { getArticle, getSession, gradesInLastHour, saveAttemptAndGrade } from "@/lib/db";
import { gradeAttempt } from "@/lib/grader";
import { GRADES_PER_HOUR, checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";
import { SubmitAttemptInput } from "@/lib/schemas";
import { precheck } from "@/lib/textcheck";
import { GRADE_COST, refundGrade, spendForGrade } from "@/lib/tokens";

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

  // 先扣 Token；評分失敗就退回。冪等鍵用這次作答的 id：同一次送出重試不會扣兩次
  const attemptId = crypto.randomUUID();
  const paid = await spendForGrade(env, clientId, { ref: id, idemKey: `grade:${attemptId}`, note: article.title });
  if (!paid.ok) return jsonError(402, paid.message);
  const tokens = paid.balance;

  let result;
  try {
    result = await gradeAttempt(env, article, session.grade, outline, summary);
  } catch (e) {
    console.error("grade failed", e);
    await refundGrade(env, clientId, paid.ledgerId, "評分失敗，退回").catch((err) => console.error("refund failed", err));
    return jsonError(502, `評分失敗（已退回 ${GRADE_COST} Token）：${(e as Error).message}`);
  }

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

  // 不把精確的照抄比例傳給前端（避免一字一字試到剛好低於門檻）
  const { copyRatio: _hidden, ...publicResult } = result;
  void _hidden;
  return NextResponse.json({ attemptId, readSeconds, tokens, ...publicResult });
}
