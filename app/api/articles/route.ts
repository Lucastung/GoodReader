import { NextResponse } from "next/server";
import { listArticles } from "@/lib/db";
import { checkAccess, cfEnv } from "@/lib/http";

export async function GET(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  return NextResponse.json({ articles: await listArticles(env.DB) });
}
