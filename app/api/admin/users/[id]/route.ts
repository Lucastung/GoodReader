import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/admin";
import { userDetail } from "@/lib/admin-db";
import { PinSchema, clearFailures, getUserRow, hashPin, nicknameKey } from "@/lib/auth";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { removeAvatar } from "@/lib/avatar";
import { creditTokens, spendTokens } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const d = await userDetail(env.DB, (await params).id);
  return d ? NextResponse.json(d) : jsonError(404, "找不到這個帳號");
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resetPin"), pin: PinSchema }),
  z.object({ action: z.literal("clearParentPin") }),
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("logoutAll") }),
  z.object({ action: z.literal("removeAvatar") }),
  z.object({
    action: z.literal("adjustTokens"),
    amount: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 10000, "數量要是 ±1～10000"),
    note: z.string().trim().min(1, "請寫原因").max(100),
  }),
]);

/** 帳戶操作：重設 PIN、清除家長 PIN、停用／啟用、登出所有裝置 */
export async function POST(req: Request, { params }: Ctx) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const { id } = await params;
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "參數錯誤");
  const user = await getUserRow(env.DB, id);
  if (!user) return jsonError(404, "找不到這個帳號");
  const db = env.DB;
  const logout = db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(id);
  const body = parsed.data;
  switch (body.action) {
    case "resetPin": {
      const h = await hashPin(body.pin);
      await db.batch([db.prepare("UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?").bind(h.hash, h.salt, id), logout]);
      await clearFailures(db, `login:${nicknameKey(user.nickname)}`);
      break;
    }
    case "clearParentPin":
      await db.prepare("UPDATE users SET parent_pin_hash = NULL, parent_pin_salt = NULL WHERE id = ?").bind(id).run();
      await clearFailures(db, `parent:${id}`);
      break;
    case "disable":
      await db.batch([db.prepare("UPDATE users SET disabled = 1 WHERE id = ?").bind(id), logout]);
      break;
    case "enable":
      await db.prepare("UPDATE users SET disabled = 0 WHERE id = ?").bind(id).run();
      break;
    case "logoutAll":
      await logout.run();
      break;
    case "removeAvatar":
      await removeAvatar(db, id);
      break;
    case "adjustTokens": {
      const e = { reason: "admin" as const, note: body.note, createdBy: a.email };
      const ok =
        body.amount > 0
          ? await creditTokens(db, id, body.amount, e)
          : await spendTokens(db, id, -body.amount, e);
      if (ok == null) return jsonError(409, "餘額不夠扣");
      break;
    }
  }
  await audit(db, a, `user.${body.action}`, id, {
    nickname: user.nickname,
    ...(body.action === "adjustTokens" ? { amount: body.amount, note: body.note } : {}),
  });
  return NextResponse.json({ ok: true });
}
