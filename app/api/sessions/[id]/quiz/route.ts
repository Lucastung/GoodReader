import { NextResponse } from "next/server";
import { getArticle, getSession } from "@/lib/db";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";
import { quizAttemptFor, resultFromRow, saveQuizAttempt, scoreQuiz } from "@/lib/quiz";
import { QuizSchema, SubmitQuizInput } from "@/lib/schemas";
import { spendForGrade } from "@/lib/tokens";

/** 閱讀測驗交卷：每篇只能作答一次，扣 Token，回傳成績與解析 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const { id } = await params;

  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const clientId = user.id;

  const parsed = SubmitQuizInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "5 題都要作答");
  const { answers } = parsed.data;

  const session = await getSession(env.DB, id);
  if (!session || session.client_id !== clientId) return jsonError(404, "找不到這次練習");
  if (session.mode !== "basic" || !session.quiz_json) return jsonError(400, "這次練習不是閱讀測驗");
  const quiz = QuizSchema.safeParse(JSON.parse(session.quiz_json));
  if (!quiz.success) return jsonError(500, "題目資料有誤，請重新開始這篇");

  const done = await quizAttemptFor(env.DB, clientId, session.article_id);
  if (done) return NextResponse.json({ ...resultFromRow(done), alreadyDone: true, tokens: user.tokens }, { status: 409 });

  const article = await getArticle(env.DB, session.article_id);
  // 冪等鍵用這次練習的 id：每篇只交一次卷，同時送出兩次也只扣一次
  const paid = await spendForGrade(env, clientId, { ref: id, idemKey: `quiz:${id}`, note: `${article?.title ?? ""}（閱讀測驗）` });
  if (!paid.ok) return jsonError(402, paid.message);
  const tokens = paid.balance;

  const result = scoreQuiz(quiz.data, answers);
  const readSeconds = Math.round((Date.now() - Date.parse(session.started_at + "Z")) / 1000);
  const saved = await saveQuizAttempt(env.DB, {
    id: crypto.randomUUID(),
    sessionId: id,
    clientId,
    articleId: session.article_id,
    quiz: quiz.data,
    answers,
    result,
    readSeconds,
  });
  if (!saved) {
    // 同時送出兩次：第二次不計；扣點用同一個冪等鍵，只扣了一次，不用退
    const first = await quizAttemptFor(env.DB, clientId, session.article_id);
    return NextResponse.json({ ...(first ? resultFromRow(first) : result), alreadyDone: true, tokens }, { status: 409 });
  }
  return NextResponse.json({ ...result, readSeconds, tokens });
}
