import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { createSession, getArticle, pickArticle, recentArticleIds } from "@/lib/db";
import { ensureKeypoints, ensureQuiz } from "@/lib/grader";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";
import { quizAttemptFor, quizDoneArticleIds } from "@/lib/quiz";
import { StartSessionInput } from "@/lib/schemas";
import { suggestedSummaryRange } from "@/lib/textcheck";
import { GRADE_COST } from "@/lib/tokens";

/** 抽一篇文章並開始練習（mode：basic＝閱讀測驗、advanced＝大綱＋摘要） */
export async function POST(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;

  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const clientId = user.id;

  const parsed = StartSessionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "參數錯誤");
  const { grade, genre, articleId, mode } = parsed.data;

  // 閱讀測驗每篇只能作答一次：指定已做過的文章 → 帶回原本那次，看成績與解析
  if (mode === "basic" && articleId) {
    const done = await quizAttemptFor(env.DB, clientId, articleId);
    if (done) return NextResponse.json({ sessionId: done.session_id, done: true });
  }
  if (user.tokens < GRADE_COST) return jsonError(402, `Token 不足：每次評分需要 ${GRADE_COST} 個 Token`);

  const exclude = await recentArticleIds(env.DB, clientId);
  const quizDone = mode === "basic" ? await quizDoneArticleIds(env.DB, clientId) : [];
  let article = articleId
    ? await getArticle(env.DB, articleId, true)
    : await pickArticle(env.DB, grade, genre, [...new Set([...exclude, ...quizDone])]);
  // 隨機抽到做過的（候選都做完、放寬條件時可能發生）就當作沒有
  if (article && mode === "basic" && !articleId && quizDone.includes(article.id)) article = null;
  if (!article)
    return jsonError(404, mode === "basic" && !articleId ? "這個條件下的文章你都做過閱讀測驗了，換個文體或試試進階吧" : "找不到符合條件的文章");

  let quizJson: string | null = null;
  if (mode === "basic") {
    try {
      quizJson = JSON.stringify(await ensureQuiz(env, article));
    } catch (e) {
      console.error("quiz", e);
      return jsonError(502, `出題失敗，請稍後再試：${(e as Error).message}`);
    }
  }

  const sessionId = crypto.randomUUID();
  await createSession(env.DB, { id: sessionId, clientId, articleId: article.id, grade, mode, quizJson });

  if (mode === "advanced") {
    // 學生閱讀的同時，在背景先產生要點底稿，送出時就不用等
    getCloudflareContext().ctx.waitUntil(ensureKeypoints(env, article).catch((e) => console.error("keypoints", e)));
  }

  return NextResponse.json({
    sessionId,
    grade,
    mode,
    article,
    summaryRange: suggestedSummaryRange(article.charCount),
  });
}
