"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Avatar } from "./Avatar";

type Me = { id: string; nickname: string; avatarVersion: number; tokens: number } | null;

/** 其他頁面改了 Token／頭像／暱稱時呼叫，頁首會重新讀取 */
export const refreshUserMenu = () => window.dispatchEvent(new Event("gr:me-changed"));

export function UserMenu() {
  const [me, setMe] = useState<Me | undefined>(undefined);

  useEffect(() => {
    const load = () =>
      api<{ user: Me }>("/api/auth/me")
        .then((r) => setMe(r.user))
        .catch(() => setMe(null));
    load();
    window.addEventListener("gr:me-changed", load);
    return () => window.removeEventListener("gr:me-changed", load);
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  return (
    <div className="user-menu">
      <Link href="/demo" className="demo-btn" title="互動示範：開文章、列大綱、寫摘要、看評分">
        DEMO
      </Link>
      {me === undefined ? null : me ? (
        <>
          <Link href="/me" className="token-chip" title="Token 餘額，點開看紀錄">
            🪙 {me.tokens}
          </Link>
          <Link href="/me" className="me-link" title="個人資料">
            <Avatar nickname={me.nickname} version={me.avatarVersion} size={28} />
            <span className="who">{me.nickname}</span>
          </Link>
          <button className="linkish" onClick={logout}>
            登出
          </button>
        </>
      ) : (
        <Link href="/login" className="linkish">
          登入
        </Link>
      )}
    </div>
  );
}
