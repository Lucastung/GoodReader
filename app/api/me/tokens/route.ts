import { NextResponse } from "next/server";
import { cfEnv, requireUser } from "@/lib/http";
import { GRADE_COST, tokenInfo } from "@/lib/tokens";

/** Token 餘額與最近 50 筆紀錄（全站共用的錢包，含其他應用的使用紀錄） */
export async function GET(req: Request) {
  const env = cfEnv();
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const { balance, history } = await tokenInfo(env, user.id);
  return NextResponse.json({ balance, history, gradeCost: GRADE_COST });
}
