import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/admin";
import { userDetail } from "@/lib/admin-db";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { removeAvatar } from "@/lib/avatar";
import { APP } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const d = await userDetail(env, (await params).id);
  return d ? NextResponse.json(d) : jsonError(404, "找不到這個帳號");
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("removeAvatar") }),
  z.object({
    action: z.literal("adjustTokens"),
    amount: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 10000, "數量要是 ±1～10000"),
    note: z.string().trim().min(1, "請寫原因").max(100),
  }),
]);

/**
 * 帳戶操作：在好好讀書停用／啟用、移除頭像、調整 Token。
 * 停用只影響好好讀書（整個 lucasact 帳號的停用在帳號服務）；Token 是全站共用的錢包。
 */
export async function POST(req: Request, { params }: Ctx) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const { id } = await params;
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "參數錯誤");
  const db = env.DB;
  const user = await db.prepare("SELECT id, name FROM users WHERE id = ?").bind(id).first<{ id: string; name: string }>();
  if (!user) return jsonError(404, "找不到這個帳號");
  const body = parsed.data;
  switch (body.action) {
    case "disable":
      await db.prepare("UPDATE users SET disabled = 1 WHERE id = ?").bind(id).run();
      break;
    case "enable":
      await db.prepare("UPDATE users SET disabled = 0 WHERE id = ?").bind(id).run();
      break;
    case "removeAvatar":
      await removeAvatar(db, id);
      break;
    case "adjustTokens":
      try {
        await env.ACCOUNTS.adminCredit(id, body.amount, APP, body.note, a.email);
      } catch (e) {
        return jsonError(409, (e as Error).message.includes("不夠") ? "可調整的餘額不夠扣（只能扣購買來的 Token）" : `調整失敗：${(e as Error).message}`);
      }
      break;
  }
  await audit(db, a, `user.${body.action}`, id, {
    nickname: user.name,
    ...(body.action === "adjustTokens" ? { amount: body.amount, note: body.note } : {}),
  });
  return NextResponse.json({ ok: true });
}
