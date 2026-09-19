import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { articleBests, listArticles } from "@/lib/db";
import { checkAccess, cfEnv } from "@/lib/http";

export async function GET(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const [articles, user] = await Promise.all([listArticles(env.DB), currentUser(req, env.DB)]);
  // 登入時附上每篇的最高分，清單上標「已評」
  const bests = user ? await articleBests(env.DB, user.id) : {};
  return NextResponse.json({ articles: articles.map((a) => ({ ...a, best: bests[a.id] ?? null })) });
}
