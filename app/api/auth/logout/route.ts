import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";
import { cfEnv } from "@/lib/http";
import { withSessionCookie } from "@/lib/http";

export async function POST(req: Request) {
  await endSession(req, cfEnv().DB);
  return withSessionCookie(NextResponse.json({ ok: true }), null, req);
}
