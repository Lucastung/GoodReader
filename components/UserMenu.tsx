"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Avatar } from "./Avatar";

type Me = { id: string; nickname: string; avatarUrl: string; avatarVersion: number; tokens: number; unlimited: boolean } | null;

/** 其他頁面改了 Token／頭像／暱稱時呼叫，頁首會重新讀取 */
export const refreshUserMenu = () => window.dispatchEvent(new Event("gr:me-changed"));

export function UserMenu() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [logoutUrl, setLogoutUrl] = useState("/");

  useEffect(() => {
    const load = () =>
      api<{ user: Me; logout: string }>("/api/auth/me")
        .then((r) => {
          setMe(r.user);
          setLogoutUrl(r.logout);
        })
        .catch(() => setMe(null));
    load();
    window.addEventListener("gr:me-changed", load);
    return () => window.removeEventListener("gr:me-changed", load);
  }, []);

  return (
    <div className="user-menu">
      <Link href="/demo" className="demo-btn" title="互動示範：開文章、列大綱、寫摘要、看評分">
        DEMO
      </Link>
      {me === undefined ? null : me ? (
        <>
          <Link href="/me" className="token-chip" title="Token 餘額，點開看紀錄">
            🪙 {me.unlimited ? "∞" : me.tokens}
          </Link>
          <Link href="/me" className="me-link" title="個人資料">
            <Avatar nickname={me.nickname} version={me.avatarVersion} src={me.avatarVersion > 0 ? null : me.avatarUrl || null} size={28} />
            <span className="who">{me.nickname}</span>
          </Link>
          <a className="linkish" href={logoutUrl} title="登出 LUCAS 帳號（lucasact.com 各應用都會登出）">
            登出
          </a>
        </>
      ) : (
        <Link href="/login" className="linkish">
          登入
        </Link>
      )}
    </div>
  );
}
