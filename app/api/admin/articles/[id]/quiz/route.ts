import { NextResponse } from "next/server";
import { audit } from "@/lib/admin";
import { getArticle } from "@/lib/db";
import { ensureQuiz } from "@/lib/grader";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { getQuiz, saveQuiz } from "@/lib/quiz";
import { QuizSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** 產生（或重新產生）閱讀測驗題目 */
export async function POST(req: Request, { params }: Ctx) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const { id } = await params;
  const article = await getArticle(env.DB, id);
  if (!article) return jsonError(404, "找不到這篇文章");
  try {
    await ensureQuiz(env, article, true);
    await audit(env.DB, a, "article.quiz.generate", id);
    return NextResponse.json({ quiz: await getQuiz(env.DB, id) });
  } catch (e) {
    return jsonError(502, `出題失敗：${(e as Error).message}`);
  }
}

/** 老師修改後儲存（已作答的學生不受影響：作答紀錄存的是當時的題目） */
export async function PUT(req: Request, { params }: Ctx) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const { id } = await params;
  const parsed = QuizSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const iss = parsed.error.issues[0];
    const where = iss?.path[0] === "questions" && typeof iss.path[1] === "number" ? `第 ${iss.path[1] + 1} 題：` : "";
    return jsonError(400, `${where}${iss?.message ?? "格式錯誤"}`);
  }
  const old = await getQuiz(env.DB, id);
  if (!old) return jsonError(404, "這篇還沒有題目，請先產生");
  await saveQuiz(env.DB, id, old.model, parsed.data, a.email);
  await audit(env.DB, a, "article.quiz.edit", id);
  return NextResponse.json({ quiz: await getQuiz(env.DB, id) });
}
