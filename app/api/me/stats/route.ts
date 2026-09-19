import { NextResponse } from "next/server";
import { getStats } from "@/lib/db";
import { checkAccess, cfEnv, jsonError } from "@/lib/http";

export async function GET(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const clientId = new URL(req.url).searchParams.get("clientId") ?? "";
  if (clientId.length < 8 || clientId.length > 64) return jsonError(400, "參數錯誤");
  return NextResponse.json(await getStats(env.DB, clientId));
}
