import { NextResponse } from "next/server";
import { z } from "zod";
import {
  LOCK_MINUTES,
  PinSchema,
  clearFailures,
  getUserRow,
  isLocked,
  recordFailure,
  setParentPin,
  verifyPin,
} from "@/lib/auth";
import { addRedemption, getStats } from "@/lib/db";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";

const Input = z.object({
  points: z.number().int().positive().max(1_000_000),
  parentPin: PinSchema,
  /** 帳號還沒有家長 PIN 時，這次輸入的 PIN 會被設為家長 PIN */
  setupParentPin: z.boolean().optional(),
});

/** 積分折現：需要家長 PIN；扣除點數不能超過剩餘積分 */
export async function POST(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "資料格式錯誤");
  const { points, parentPin, setupParentPin } = parsed.data;

  const row = await getUserRow(env.DB, user.id);
  if (!row) return jsonError(401, "請先登入");
  const key = `parent:${user.id}`;

  if (!row.parent_pin_hash) {
    if (!setupParentPin) return jsonError(409, "還沒設定家長 PIN");
    if (await verifyPin(parentPin, row.pin_hash, row.pin_salt))
      return jsonError(400, "家長 PIN 不能和學生登入 PIN 一樣");
    await setParentPin(env.DB, user.id, parentPin);
  } else {
    if (await isLocked(env.DB, key)) return jsonError(429, `家長 PIN 錯誤太多次，請 ${LOCK_MINUTES} 分鐘後再試`);
    if (!(await verifyPin(parentPin, row.parent_pin_hash, row.parent_pin_salt!))) {
      await recordFailure(env.DB, key);
      return jsonError(403, "家長 PIN 不正確");
    }
    await clearFailures(env.DB, key);
  }

  const before = await getStats(env.DB, user.id);
  if (points > before.remaining) return jsonError(422, `剩餘積分只有 ${before.remaining} 點`);
  await addRedemption(env.DB, user.id, points);
  return NextResponse.json({ ...(await getStats(env.DB, user.id)), hasParentPin: true });
}
