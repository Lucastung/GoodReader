import { NextResponse } from "next/server";
import { getArticle, getSession, listAttempts, previousBest } from "@/lib/db";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";
import { publicQuestions, quizAttemptBySession, resultFromRow } from "@/lib/quiz";
import type { Quiz } from "@/lib/schemas";
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

  const base = {
    sessionId: session.id,
    grade: session.grade,
    mode: session.mode,
    startedAt: session.started_at,
    article,
    tokens: user.tokens,
  };

  if (session.mode === "basic") {
    const row = await quizAttemptBySession(env.DB, id);
    // 還沒交卷只給題目（不含答案與解析）；交過卷給完整結果
    return NextResponse.json({
      ...base,
      questions: row || !session.quiz_json ? null : publicQuestions(JSON.parse(session.quiz_json) as Quiz),
      quizResult: row ? { ...resultFromRow(row), submittedAt: row.submitted_at, readSeconds: row.read_seconds } : null,
    });
  }

  return NextResponse.json({
    ...base,
    summaryRange: suggestedSummaryRange(article.charCount),
    attempts: await listAttempts(env.DB, id),
    previousBest: await previousBest(env.DB, clientId, session.article_id, session.id),
  });
}
