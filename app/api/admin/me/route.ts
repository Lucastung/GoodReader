import { NextResponse } from "next/server";
import { cfEnv, requireAdmin } from "@/lib/http";

export async function GET(req: Request) {
  const a = await requireAdmin(req, cfEnv(), ["admin", "reviewer"]);
  if (a instanceof Response) return a;
  return NextResponse.json(a);
}
