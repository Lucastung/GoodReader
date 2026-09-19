import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/admin";
import { insertArticle } from "@/lib/admin-db";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { ArticleInput } from "@/lib/schemas";

const Item = ArticleInput.extend({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/, "id 只能用小寫英數與連字號").optional(),
  license: ArticleInput.shape.license.default("public-domain"),
});

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
    created.push(await insertArticle(env.DB, p.data, { origin: "import", createdBy: a.email }));
  }
  await audit(env.DB, a, "article.import", `${created.length} 篇`, { skipped: skipped.length });
  return NextResponse.json({ created, skipped });
}
