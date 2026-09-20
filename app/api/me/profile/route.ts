import { NextResponse } from "next/server";
import { z } from "zod";
import { BioSchema, GradeLevelSchema } from "@/lib/auth";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";

const Input = z.object({
  gradeLevel: GradeLevelSchema.nullable().optional(),
  bio: BioSchema.nullable().optional(),
});

/** 改好好讀書的個人設定：年級、自我介紹（沒給的欄位不改）。顯示名稱在 lucasact.com 的帳號頁改 */
export async function PUT(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "資料格式錯誤");
  const { gradeLevel, bio } = parsed.data;

  const sets: string[] = [];
  const args: unknown[] = [];
  if (gradeLevel !== undefined) {
    sets.push("grade_level = ?");
    args.push(gradeLevel);
  }
  if (bio !== undefined) {
    sets.push("bio = ?");
    args.push(bio?.trim() || null);
  }
  if (sets.length) await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, user.id).run();
  return NextResponse.json({ ok: true });
}
