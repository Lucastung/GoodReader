import { NextResponse } from "next/server";
import { cfEnv, requireUser } from "@/lib/http";
import { GRADE_COST, SIGNUP_BONUS, tokenBalance, tokenHistory } from "@/lib/tokens";

/** Token 餘額與最近 50 筆紀錄 */
export async function GET(req: Request) {
  const env = cfEnv();
  const user = await requireUser(req, env);
  if (user instanceof Response) return user;
  const [balance, history] = await Promise.all([tokenBalance(env.DB, user.id), tokenHistory(env.DB, user.id)]);
  return NextResponse.json({ balance, history, gradeCost: GRADE_COST, signupBonus: SIGNUP_BONUS });
}
