"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Me = { id: string; nickname: string } | null;

export function UserMenu() {
  const [me, setMe] = useState<Me | undefined>(undefined);

  useEffect(() => {
    api<{ user: Me }>("/api/auth/me")
      .then((r) => setMe(r.user))
      .catch(() => setMe(null));
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
          <span className="who" title="目前登入">
            {me.nickname}
          </span>
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
