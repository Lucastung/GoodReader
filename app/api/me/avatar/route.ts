import { NextResponse } from "next/server";
import { z } from "zod";
import { avatarResponse, getAvatar, parseAvatarDataUrl, removeAvatar } from "@/lib/avatar";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";

/** 自己的頭像圖片（頭像不公開，只有本人和管理者看得到） */
export async function GET(req: Request) {
  const env = cfEnv();
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const a = await getAvatar(env.DB, user.id);
  return a ? avatarResponse(a) : new Response(null, { status: 404 });
}

/** 上傳頭像：{ dataUrl }（瀏覽器已裁切縮小） */
export async function PUT(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const body = z.object({ dataUrl: z.string().max(120_000) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError(400, "圖片太大或格式錯誤");
  const img = parseAvatarDataUrl(body.data.dataUrl);
  if ("error" in img) return jsonError(400, img.error);
  const [, upd] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO avatars (user_id, mime, data_b64) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET mime = excluded.mime, data_b64 = excluded.data_b64, updated_at = datetime('now')`,
    ).bind(user.id, img.mime, img.b64),
    env.DB.prepare("UPDATE users SET avatar_version = avatar_version + 1 WHERE id = ? RETURNING avatar_version").bind(user.id),
  ]);
  return NextResponse.json({ avatarVersion: (upd.results[0] as { avatar_version: number }).avatar_version });
}

export async function DELETE(req: Request) {
  const env = cfEnv();
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  await removeAvatar(env.DB, user.id);
  return NextResponse.json({ ok: true });
}
