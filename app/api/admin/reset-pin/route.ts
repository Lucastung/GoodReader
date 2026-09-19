import { NextResponse } from "next/server";
import { z } from "zod";
import { PinSchema, clearFailures, findUserByNickname, hashPin, nicknameKey } from "@/lib/auth";
import { checkAdmin, cfEnv, jsonError } from "@/lib/http";

const Input = z.object({
  nickname: z.string().trim().min(1).max(20),
  /** 新的學生 PIN；不給就不改 */
  pin: PinSchema.optional(),
  /** true = 清除家長 PIN，下次扣除時重新設定 */
  clearParentPin: z.boolean().optional(),
});

/** 管理端：重設學生 PIN 或清除家長 PIN（需 Authorization: Bearer ADMIN_TOKEN） */
export async function POST(req: Request) {
  const env = cfEnv();
  const denied = checkAdmin(req, env);
  if (denied) return denied;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "參數錯誤");
  const { nickname, pin, clearParentPin } = parsed.data;
  const user = await findUserByNickname(env.DB, nickname);
  if (!user) return jsonError(404, "找不到這個暱稱");
  const stmts = [];
  if (pin) {
    const h = await hashPin(pin);
    stmts.push(env.DB.prepare("UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?").bind(h.hash, h.salt, user.id));
    stmts.push(env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(user.id));
  }
  if (clearParentPin)
    stmts.push(env.DB.prepare("UPDATE users SET parent_pin_hash = NULL, parent_pin_salt = NULL WHERE id = ?").bind(user.id));
  if (!stmts.length) return jsonError(400, "沒有要改的項目");
  await env.DB.batch(stmts);
  await clearFailures(env.DB, `login:${nicknameKey(nickname)}`);
  await clearFailures(env.DB, `parent:${user.id}`);
  return NextResponse.json({ ok: true });
}
