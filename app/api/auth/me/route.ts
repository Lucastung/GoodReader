import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { cfEnv } from "@/lib/http";

export async function GET(req: Request) {
  return NextResponse.json({ user: await currentUser(req, cfEnv().DB) });
}
