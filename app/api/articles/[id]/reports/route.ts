import { NextResponse } from "next/server";
import { checkAccess, cfEnv, jsonError, requireUser } from "@/lib/http";
import { ReportInput, createReport } from "@/lib/reports";

/** 學生回報文章問題（內容錯誤、版權問題），需要登入 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const parsed = ReportInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "資料格式錯誤");
  const { id } = await params;
  const r = await createReport(env.DB, user.id, id, parsed.data);
  if (!r.ok) return jsonError(r.status, r.error);
  return NextResponse.json({ ok: true, id: r.id });
}
