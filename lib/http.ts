import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

export function cfEnv(): CloudflareEnv {
  return getCloudflareContext().env as CloudflareEnv;
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** 設了 DEMO_ACCESS_CODE 就要求請求帶 x-access-code */
export function checkAccess(req: Request, env: CloudflareEnv): Response | null {
  const code = env.DEMO_ACCESS_CODE;
  if (!code) return null;
  if (req.headers.get("x-access-code") === code) return null;
  return jsonError(401, "需要通行碼");
}

export const GRADES_PER_HOUR = 20;

import { SESSION_COOKIE, SESSION_DAYS, currentUser, type User } from "./auth";

/** 需要登入：回傳使用者，或 401 回應 */
export async function requireUser(req: Request, env: CloudflareEnv): Promise<User | Response> {
  const user = await currentUser(req, env.DB);
  return user ?? jsonError(401, "請先登入");
}

export function withSessionCookie(res: NextResponse, token: string | null, req: Request) {
  const secure = new URL(req.url).protocol === "https:";
  res.cookies.set(SESSION_COOKIE, token ?? "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: token ? SESSION_DAYS * 86400 : 0,
  });
  return res;
}


import { getAdmin, type Admin, type AdminRole } from "./admin";

/** 後台 API：需要指定角色之一，否則回 401/403 */
export async function requireAdmin(
  req: Request,
  env: CloudflareEnv,
  roles: AdminRole[] = ["admin"],
): Promise<Admin | Response> {
  const a = await getAdmin(req, env);
  if ("error" in a) return jsonError(a.status, a.error);
  if (!roles.includes(a.role)) return jsonError(403, "這個功能只有管理者可以使用");
  return a;
}
