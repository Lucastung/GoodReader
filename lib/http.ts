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

export function checkAdmin(req: Request, env: CloudflareEnv): Response | null {
  const token = env.ADMIN_TOKEN;
  if (!token) return jsonError(403, "未設定 ADMIN_TOKEN");
  if (req.headers.get("authorization") === `Bearer ${token}`) return null;
  return jsonError(401, "管理權限不足");
}

export const GRADES_PER_HOUR = 20;
