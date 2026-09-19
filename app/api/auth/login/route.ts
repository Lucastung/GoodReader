import { NextResponse } from "next/server";
import { z } from "zod";
import {
  LOCK_MINUTES,
  claimAnonymous,
  clearFailures,
  findUserByNickname,
  isLocked,
  nicknameKey,
  recordFailure,
  startSession,
  toUser,
  verifyPin,
} from "@/lib/auth";
import { checkAccess, cfEnv, jsonError } from "@/lib/http";
import { withSessionCookie } from "@/lib/http";

const Input = z.object({ nickname: z.string().trim().min(1).max(20), pin: z.string().max(6), anonId: z.string().max(64).optional() });

export async function POST(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "請輸入暱稱與 PIN");
  const { nickname, pin, anonId } = parsed.data;
  const key = `login:${nicknameKey(nickname)}`;
  if (await isLocked(env.DB, key)) return jsonError(429, `錯誤太多次，請 ${LOCK_MINUTES} 分鐘後再試`);

  const row = await findUserByNickname(env.DB, nickname);
  if (!row || !(await verifyPin(pin, row.pin_hash, row.pin_salt))) {
    await recordFailure(env.DB, key);
    return jsonError(401, "暱稱或 PIN 不正確");
  }
  await clearFailures(env.DB, key);
  await claimAnonymous(env.DB, anonId, row.id);
  const token = await startSession(env.DB, row.id);
  return withSessionCookie(NextResponse.json({ user: toUser(row) }), token, req);
}
