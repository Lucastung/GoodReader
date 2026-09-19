import { NextResponse } from "next/server";
import { listUsers } from "@/lib/admin-db";
import { cfEnv, requireAdmin } from "@/lib/http";

export async function GET(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const u = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  return NextResponse.json(await listUsers(env.DB, u.searchParams.get("q") ?? "", limit, offset));
}
