import { NextResponse } from "next/server";
import { z } from "zod";
import { addRedemption, getStats } from "@/lib/db";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";

const Input = z.object({ points: z.number().int().positive().max(1_000_000) });

/** 積分扣除：扣除點數不能超過剩餘積分 */
export async function POST(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "資料格式錯誤");
  const { points } = parsed.data;

  const before = await getStats(env.DB, user.id);
  if (points > before.remaining) return jsonError(422, `剩餘積分只有 ${before.remaining} 點`);
  await addRedemption(env.DB, user.id, points);
  return NextResponse.json(await getStats(env.DB, user.id));
}
