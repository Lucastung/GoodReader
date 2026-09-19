import { NextResponse } from "next/server";
import { z } from "zod";
import { addRedemption, getStats } from "@/lib/db";
import { checkAccess, cfEnv, jsonError } from "@/lib/http";

const Input = z.object({
  clientId: z.string().min(8).max(64),
  points: z.number().int().positive().max(1_000_000),
});

/** 積分折現：扣除指定點數，不能超過剩餘積分 */
export async function POST(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "請輸入正整數點數");
  const { clientId, points } = parsed.data;
  const before = await getStats(env.DB, clientId);
  if (points > before.remaining) return jsonError(422, `剩餘積分只有 ${before.remaining} 點`);
  await addRedemption(env.DB, clientId, points);
  return NextResponse.json(await getStats(env.DB, clientId));
}
