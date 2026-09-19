"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/client";

export type AdminMe = { email: string; role: "admin" | "reviewer" };
const Ctx = createContext<AdminMe | null>(null);
export const useAdmin = () => useContext(Ctx)!;

const NAV = [
  { href: "/admin/stats", label: "使用與成本", roles: ["admin"] },
  { href: "/admin/users", label: "帳戶", roles: ["admin"] },
  { href: "/admin/texts", label: "範文", roles: ["admin", "reviewer"] },
  { href: "/admin/roles", label: "權限", roles: ["admin"] },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const path = usePathname();

  useEffect(() => {
    api<AdminMe>("/api/admin/me")
      .then(setMe)
      .catch((e) => setErr(e.message));
  }, []);

  if (err)
    return (
      <div className="card narrow">
        <h2>無法進入後台</h2>
        <p className="error">{err}</p>
        <p className="small muted">後台用 Cloudflare Access 的 email 驗證碼登入。登入過期時重新整理頁面即可。</p>
      </div>
    );
  if (!me) return <p className="muted">載入中…</p>;

  return (
    <Ctx.Provider value={me}>
      <div className="admin">
        <nav className="admin-nav">
          <span className="admin-title">後台</span>
          {NAV.filter((n) => n.roles.includes(me.role)).map((n) => (
            <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? "on" : ""}>
              {n.label}
            </Link>
          ))}
          <span className="admin-who small muted">
            {me.email}（{me.role === "admin" ? "管理者" : "審稿老師"}）
          </span>
        </nav>
        {children}
      </div>
    </Ctx.Provider>
  );
}

/** 管理者專用頁面：審稿老師看到提示 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const me = useAdmin();
  if (me.role !== "admin") return <p className="muted">這個頁面只有管理者可以看。</p>;
  return <>{children}</>;
}

export const fmtTime = (s: string | null | undefined) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleString("zh-TW", { hour12: false }) : "—");
export const fmtDate = (s: string | null | undefined) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleDateString("zh-TW") : "—");
