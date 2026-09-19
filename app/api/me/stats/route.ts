import { NextResponse } from "next/server";
import { getStats } from "@/lib/db";
import { checkAccess, cfEnv, requireUser } from "@/lib/http";

export async function GET(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  return NextResponse.json(await getStats(env.DB, user.id));
}
