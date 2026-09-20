import { NextResponse } from "next/server";
import { currentUser, loginUrl, logoutUrl, safeNext } from "@/lib/auth";
import { cfEnv } from "@/lib/http";

/** 目前登入的使用者，以及登入／登出的網址（登入在 accounts.lucasact.com，登完回到 next） */
export async function GET(req: Request) {
  const env = cfEnv();
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  return NextResponse.json({
    user: await currentUser(req, env),
    login: { google: loginUrl(env, "google", next), facebook: loginUrl(env, "facebook", next) },
    logout: logoutUrl(env),
    account: `${(env.ACCOUNTS_URL || "https://accounts.lucasact.com").replace(/\/+$/, "")}/login`,
  });
}
