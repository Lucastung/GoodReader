import { avatarResponse, getAvatar } from "@/lib/avatar";
import { cfEnv, requireAdmin } from "@/lib/http";

/** 管理者看學生頭像（檢查不當圖片用） */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const img = await getAvatar(env.DB, (await params).id);
  return img ? avatarResponse(img) : new Response(null, { status: 404 });
}
