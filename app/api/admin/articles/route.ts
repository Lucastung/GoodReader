import { NextResponse } from "next/server";
import { audit } from "@/lib/admin";
import { insertArticle, listAdminArticles } from "@/lib/admin-db";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { ArticleInput } from "@/lib/schemas";

const REVIEW = ["admin", "reviewer"] as const;

export async function GET(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, [...REVIEW]);
  if (a instanceof Response) return a;
  const u = new URL(req.url).searchParams;
  return NextResponse.json(
    await listAdminArticles(env.DB, {
      status: u.get("status") || undefined,
      q: u.get("q") || undefined,
      genre: u.get("genre") || undefined,
    }),
  );
}

/** 手動新增一篇（草稿） */
export async function POST(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, [...REVIEW]);
  if (a instanceof Response) return a;
  const parsed = ArticleInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "參數錯誤");
  const id = await insertArticle(env.DB, parsed.data, { origin: "manual", createdBy: a.email });
  await audit(env.DB, a, "article.create", id, { title: parsed.data.title });
  return NextResponse.json({ id });
}
