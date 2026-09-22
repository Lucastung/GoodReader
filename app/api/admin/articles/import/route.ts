import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/admin";
import { insertArticle } from "@/lib/admin-db";
import { saveKeypoints } from "@/lib/db";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { saveQuiz } from "@/lib/quiz";
import { ArticleInput, KeypointsSchema, QuizSchema } from "@/lib/schemas";

const Item = ArticleInput.extend({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/, "id 只能用小寫英數與連字號").optional(),
  license: ArticleInput.shape.license.default("public-domain"),
  /** 可選：一併帶進來的要點底稿與閱讀測驗題目，省下站上出題的費用 */
  keypoints: KeypointsSchema.optional(),
  quiz: QuizSchema.optional(),
});

/** 匯入時附帶的要點／題目，來源記成這個，和 LLM 產生的區分開 */
const IMPORT_MODEL = "import";

/** 批次匯入（JSON 陣列，格式同 data/classics.json），一律存成草稿；id 重複的略過 */
export async function POST(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const body = (await req.json().catch(() => null)) as unknown[] | { articles?: unknown[] } | null;
  const list = (Array.isArray(body) ? body : body?.articles) as { title?: string }[] | undefined;
  if (!Array.isArray(list) || !list.length) return jsonError(400, "請貼上 JSON 陣列");
  if (list.length > 100) return jsonError(400, "一次最多 100 篇");

  const created: string[] = [];
  const skipped: { index: number; title?: string; reason: string }[] = [];
  let withKeypoints = 0;
  let withQuiz = 0;
  for (let i = 0; i < list.length; i++) {
    const p = Item.safeParse(list[i]);
    if (!p.success) {
      const iss = p.error.issues[0];
      skipped.push({ index: i, title: list[i]?.title, reason: `${iss?.path.join(".")}: ${iss?.message}` });
      continue;
    }
    if (p.data.id) {
      const dup = await env.DB.prepare("SELECT 1 FROM articles WHERE id = ?").bind(p.data.id).first();
      if (dup) {
        skipped.push({ index: i, title: p.data.title, reason: "id 已存在" });
        continue;
      }
    }
    const { keypoints, quiz, ...article } = p.data;
    // 題目裡的 paragraph 必須指到真的存在的段落，否則解析會指錯地方
    const maxP = article.paragraphs.filter((t) => t.trim()).length;
    const badRef = quiz?.questions.findIndex((q) => q.paragraph && !isParagraphId(q.paragraph, maxP));
    if (badRef != null && badRef >= 0) {
      skipped.push({ index: i, title: p.data.title, reason: `quiz.questions.${badRef}.paragraph: 指到不存在的段落` });
      continue;
    }
    const id = await insertArticle(env.DB, article, { origin: "import", createdBy: a.email });
    created.push(id);
    if (keypoints) {
      await saveKeypoints(env.DB, id, IMPORT_MODEL, keypoints);
      withKeypoints++;
    }
    if (quiz) {
      await saveQuiz(env.DB, id, IMPORT_MODEL, quiz, a.email);
      withQuiz++;
    }
  }
  await audit(env.DB, a, "article.import", `${created.length} 篇`, { skipped: skipped.length, withKeypoints, withQuiz });
  return NextResponse.json({ created, skipped, withKeypoints, withQuiz });
}

const isParagraphId = (ref: string, max: number) => {
  const m = /^P(\d+)$/.exec(ref);
  return !!m && Number(m[1]) >= 1 && Number(m[1]) <= max;
};
