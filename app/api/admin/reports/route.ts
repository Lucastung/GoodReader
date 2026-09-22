import { NextResponse } from "next/server";
import { cfEnv, requireAdmin } from "@/lib/http";
import { listReports } from "@/lib/reports";

/** 檢舉列表：?status=open|resolved|dismissed（空白＝全部）&article=&kind= */
export async function GET(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const u = new URL(req.url).searchParams;
  return NextResponse.json(
    await listReports(env.DB, {
      status: u.get("status") || undefined,
      articleId: u.get("article") || undefined,
      kind: u.get("kind") || undefined,
    }),
  );
}
