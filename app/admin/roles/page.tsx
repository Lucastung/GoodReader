"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { AdminOnly, fmtTime, useAdmin } from "../AdminShell";

type Role = { email: string; role: "admin" | "reviewer"; note: string | null; created_by: string | null; created_at: string };
type Log = { email: string; action: string; target: string | null; detail: string | null; created_at: string };

const ROLE_LABEL = { admin: "管理者", reviewer: "審稿老師" };
const ACTION_LABEL: Record<string, string> = {
  "user.resetPin": "重設學生 PIN",
  "user.clearParentPin": "清除家長 PIN",
  "user.disable": "停用帳號",
  "user.enable": "啟用帳號",
  "user.logoutAll": "登出所有裝置",
  "role.set": "設定權限",
  "role.remove": "移除權限",
  "article.create": "新增範文",
  "article.update": "修改範文",
  "article.delete": "刪除範文",
  "article.approved": "上架",
  "article.archived": "下架",
  "article.draft": "退回待審",
  "article.generate": "AI 撰寫",
  "article.import": "匯入",
  "article.keypoints": "產生要點底稿",
  "settings.prices": "修改單價",
};

export default function RolesPage() {
  return (
    <AdminOnly>
      <Roles />
    </AdminOnly>
  );
}

function Roles() {
  const me = useAdmin();
  const [d, setD] = useState<{ bootstrap: string[]; roles: Role[]; audit: Log[] } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"reviewer" | "admin">("reviewer");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    api<{ bootstrap: string[]; roles: Role[]; audit: Log[] }>("/api/admin/roles")
      .then(setD)
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);
  useEffect(load, [load]);

  async function add() {
    setMsg(null);
    try {
      await api("/api/admin/roles", { method: "POST", body: JSON.stringify({ email, role, note: note || undefined }) });
      setMsg({ ok: true, text: `已把 ${email} 設為${ROLE_LABEL[role]}` });
      setEmail("");
      setNote("");
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }
  async function remove(e: string) {
    if (!window.confirm(`移除 ${e} 的後台權限？`)) return;
    try {
      await api(`/api/admin/roles?email=${encodeURIComponent(e)}`, { method: "DELETE" });
      load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <>
      <div className="panel">
        <h3>後台人員</h3>
        <p className="small muted">
          登入由 Cloudflare Access 寄 email 驗證碼；登入後依這張名單決定權限。審稿老師只能管範文（撰寫、編輯、上架、下架），看不到帳戶與統計。
        </p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Email</th>
                <th>角色</th>
                <th>備註</th>
                <th>加入</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d?.bootstrap.map((e) => (
                <tr key={`b-${e}`}>
                  <td>{e}</td>
                  <td>管理者</td>
                  <td className="muted">系統設定（ADMIN_EMAILS）</td>
                  <td>—</td>
                  <td />
                </tr>
              ))}
              {d?.roles.map((r) => (
                <tr key={r.email}>
                  <td>{r.email}</td>
                  <td>{ROLE_LABEL[r.role]}</td>
                  <td>{r.note}</td>
                  <td>
                    {fmtTime(r.created_at)}
                    {r.created_by ? `（${r.created_by}）` : ""}
                  </td>
                  <td>
                    {r.email !== me.email && (
                      <button className="btn danger" onClick={() => remove(r.email)}>
                        移除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <input style={{ width: "auto", flex: 2, minWidth: 200 }} type="email" placeholder="老師的 email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value as "reviewer" | "admin")}>
            <option value="reviewer">審稿老師</option>
            <option value="admin">管理者</option>
          </select>
          <input style={{ width: "auto", flex: 1, minWidth: 120 }} placeholder="備註（選填）" value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} />
          <button className="primary sm" disabled={!email.includes("@")} onClick={add}>
            加入
          </button>
        </div>
        {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}
      </div>

      <div className="panel">
        <h3>操作紀錄（最近 100 筆）</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>時間</th>
                <th>誰</th>
                <th>動作</th>
                <th>對象</th>
              </tr>
            </thead>
            <tbody>
              {d?.audit.map((l, i) => (
                <tr key={i}>
                  <td>{fmtTime(l.created_at)}</td>
                  <td>{l.email}</td>
                  <td>{ACTION_LABEL[l.action] ?? l.action}</td>
                  <td className="wrap small">{describe(l)}</td>
                </tr>
              ))}
              {d && !d.audit.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    還沒有紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function describe(l: Log) {
  let detail: Record<string, unknown> = {};
  try {
    detail = l.detail ? JSON.parse(l.detail) : {};
  } catch {
    /* 舊格式 */
  }
  if (typeof detail.nickname === "string") return detail.nickname;
  if (typeof detail.title === "string") return detail.title;
  return l.target ?? "";
}
