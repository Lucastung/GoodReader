import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/admin";
import { insertArticle } from "@/lib/admin-db";
import { logUsage } from "@/lib/db";
import { llmConfig } from "@/lib/grader";
import { chatJson } from "@/lib/llm";
import { generateArticlePrompt } from "@/lib/prompts";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { GeneratedArticleSchema } from "@/lib/schemas";

const Input = z.object({
  genre: z.enum(["散文", "記敘文", "議論文", "說明文"]),
  difficulty: z.number().int().min(1).max(5),
  length: z.number().int().min(200).max(2000),
  topic: z.string().max(100).optional(),
  notes: z.string().max(300).optional(),
  count: z.number().int().min(1).max(3).default(1),
});

/** AI 撰寫範文，存成草稿等老師審 */
export async function POST(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "參數錯誤");
  const spec = parsed.data;
  const cfg = llmConfig(env);
  const model = env.KEYPOINT_MODEL;

  const one = async (n: number) => {
    let data: z.infer<typeof GeneratedArticleSchema>;
    if (cfg.mock) {
      data = {
        title: `（模擬）${spec.topic || spec.genre}範文 ${n + 1}`,
        paragraphs: Array.from({ length: 4 }, (_, i) => `這是第 ${i + 1} 段的模擬內容，用來測試後台流程。`.repeat(4)),
        centralIdea: "（模擬）主旨",
      };
    } else {
      const r = await chatJson(cfg, model, generateArticlePrompt(spec), GeneratedArticleSchema, {
        maxTokens: Math.ceil(spec.length * 3) + 800,
        temperature: 0.9,
      });
      data = r.data;
      await logUsage(env.DB, { kind: "generate", model, ...r.usage });
    }
    const id = await insertArticle(
      env.DB,
      {
        title: data.title,
        author: "好好讀書（AI 撰寫）",
        era: "現代",
        genre: spec.genre,
        difficulty: spec.difficulty,
        paragraphs: data.paragraphs,
        license: "ai-generated",
        notes: [
          `AI 生成：${spec.genre}／難度 ${spec.difficulty}／約 ${spec.length} 字${spec.topic ? `／主題：${spec.topic}` : ""}`,
          data.centralIdea ? `AI 自述主旨：${data.centralIdea}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      { origin: "ai", createdBy: a.email },
    );
    return { id, title: data.title };
  };

  try {
    const created = await Promise.all(Array.from({ length: spec.count }, (_, i) => one(i)));
    await audit(env.DB, a, "article.generate", created.map((c) => c.id).join(","), spec);
    return NextResponse.json({ created });
  } catch (e) {
    return jsonError(502, `產生失敗：${(e as Error).message}`);
  }
}
