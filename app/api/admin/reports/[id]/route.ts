import { NextResponse } from "next/server";
import { audit } from "@/lib/admin";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";
import { HandleReportInput, handleReport } from "@/lib/reports";

/** 處理檢舉：標成已處理／不處理，或改回未處理 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = cfEnv();
  const a = await requireAdmin(req, env, ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  const parsed = HandleReportInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "狀態錯誤");
  const { id } = await params;
  if (!(await handleReport(env.DB, id, parsed.data.status, a.email, parsed.data.note))) return jsonError(404, "找不到這則檢舉");
  await audit(env.DB, a, `report.${parsed.data.status}`, id, parsed.data.note ? { note: parsed.data.note } : undefined);
  return NextResponse.json({ ok: true });
}
