import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, bootstrapAdmins } from "@/lib/admin";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";

export async function GET(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const { results } = await env.DB.prepare(
    "SELECT email, role, note, created_by, created_at FROM admin_roles ORDER BY role, email",
  ).all();
  const { results: log } = await env.DB.prepare(
    "SELECT email, action, target, detail, created_at FROM admin_audit ORDER BY created_at DESC LIMIT 100",
  ).all();
  return NextResponse.json({ bootstrap: bootstrapAdmins(env), roles: results, audit: log });
}

const Input = z.object({
  email: z.string().trim().toLowerCase().email("email 格式不對"),
  role: z.enum(["admin", "reviewer"]),
  note: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "參數錯誤");
  const { email, role, note } = parsed.data;
  await env.DB.prepare(
    `INSERT INTO admin_roles (email, role, note, created_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET role = excluded.role, note = excluded.note`,
  )
    .bind(email, role, note ?? null, a.email)
    .run();
  await audit(env.DB, a, "role.set", email, { role });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const email = new URL(req.url).searchParams.get("email")?.toLowerCase();
  if (!email) return jsonError(400, "缺少 email");
  if (email === a.email) return jsonError(400, "不能移除自己的權限");
  await env.DB.prepare("DELETE FROM admin_roles WHERE email = ?").bind(email).run();
  await audit(env.DB, a, "role.remove", email);
  return NextResponse.json({ ok: true });
}
