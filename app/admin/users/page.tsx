"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { AdminOnly, fmtDate, fmtTime } from "../AdminShell";

type Row = {
  id: string;
  nickname: string;
  created_at: string;
  disabled: number;
  has_parent_pin: number;
  done: number;
  points: number;
  redeemed: number;
  last_active: string | null;
};
type Detail = {
  user: { id: string; nickname: string; created_at: string; disabled: number; has_parent_pin: number };
  stats: { completed: number; totalPoints: number; redeemed: number; remaining: number; byDifficulty: { difficulty: number; count: number; avg: number | null }[] };
  sessions: { id: string; started_at: string; grade: string; title: string; difficulty: number; attempts: number; best: number | null }[];
  redemptions: { id: string; points: number; created_at: string }[];
  activeLogins: number;
};

const PAGE = 50;

export default function UsersPage() {
  return (
    <AdminOnly>
      <Users />
    </AdminOnly>
  );
}

function Users() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ users: Row[]; total: number } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ users: Row[]; total: number }>(`/api/admin/users?q=${encodeURIComponent(q)}&offset=${offset}&limit=${PAGE}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [q, offset]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="搜尋暱稱"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
        />
        <span className="muted small">{data ? `共 ${data.total} 個帳號` : ""}</span>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>暱稱</th>
              <th className="num">完成篇數</th>
              <th className="num">總積分</th>
              <th className="num">已扣除</th>
              <th className="num">剩餘</th>
              <th>家長 PIN</th>
              <th>最近練習</th>
              <th>建立</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className={`click ${sel === u.id ? "sel" : ""}`} onClick={() => setSel(sel === u.id ? null : u.id)}>
                <td>
                  {u.nickname} {u.disabled ? <span className="badge off">停用</span> : null}
                </td>
                <td className="num">{u.done}</td>
                <td className="num">{u.points}</td>
                <td className="num">{u.redeemed}</td>
                <td className="num">{u.points - u.redeemed}</td>
                <td>{u.has_parent_pin ? "已設定" : <span className="muted">未設定</span>}</td>
                <td>{fmtTime(u.last_active)}</td>
                <td>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
            {data && !data.users.length && (
              <tr>
                <td colSpan={8} className="muted">
                  沒有符合的帳號
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.total > PAGE && (
        <div className="toolbar">
          <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            上一頁
          </button>
          <span className="small muted">
            {offset + 1}–{Math.min(offset + PAGE, data.total)}
          </span>
          <button className="btn" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
            下一頁
          </button>
        </div>
      )}
      {sel && <UserDetail id={sel} onChanged={load} />}
    </>
  );
}

function UserDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/admin/users/${id}`).then(setD).catch((e) => setMsg({ ok: false, text: e.message }));
  }, [id]);
  useEffect(() => {
    setD(null);
    setMsg(null);
    setPin("");
    load();
  }, [load]);

  async function act(body: Record<string, unknown>, done: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/admin/users/${id}`, { method: "POST", body: JSON.stringify(body) });
      setMsg({ ok: true, text: done });
      setPin("");
      load();
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="panel muted">載入中…</div>;
  const u = d.user;
  return (
    <div className="panel">
      <h3>
        {u.nickname} {u.disabled ? <span className="badge off">停用</span> : null}
      </h3>
      <p className="small muted">
        建立於 {fmtTime(u.created_at)}・目前 {d.activeLogins} 個裝置登入中・完成 {d.stats.completed} 篇・剩餘積分{" "}
        {d.stats.remaining}／{d.stats.totalPoints}
      </p>

      <div className="toolbar">
        <input
          style={{ width: "9em" }}
          inputMode="numeric"
          placeholder="新 PIN（4–6 位）"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <button
          className="btn"
          disabled={busy || pin.length < 4}
          onClick={() => act({ action: "resetPin", pin }, `PIN 已重設為 ${pin}，所有裝置已登出`)}
        >
          重設學生 PIN
        </button>
        <button
          className="btn"
          disabled={busy || !u.has_parent_pin}
          onClick={() => act({ action: "clearParentPin" }, "家長 PIN 已清除，下次扣除時重新設定", "確定清除家長 PIN？")}
        >
          清除家長 PIN
        </button>
        <button className="btn" disabled={busy || !d.activeLogins} onClick={() => act({ action: "logoutAll" }, "已登出所有裝置")}>
          登出所有裝置
        </button>
        {u.disabled ? (
          <button className="btn ok" disabled={busy} onClick={() => act({ action: "enable" }, "帳號已啟用")}>
            啟用帳號
          </button>
        ) : (
          <button
            className="btn danger"
            disabled={busy}
            onClick={() => act({ action: "disable" }, "帳號已停用", `確定停用「${u.nickname}」？停用後無法登入，紀錄會保留。`)}
          >
            停用帳號
          </button>
        )}
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}

      <div className="two">
        <div>
          <h3>練習紀錄（最近 50 次）</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>文章</th>
                  <th className="num">難度</th>
                  <th className="num">送出</th>
                  <th className="num">最高分</th>
                </tr>
              </thead>
              <tbody>
                {d.sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtTime(s.started_at)}</td>
                    <td className="wrap">{s.title}</td>
                    <td className="num">{s.difficulty}</td>
                    <td className="num">{s.attempts}</td>
                    <td className="num">{s.best ?? "—"}</td>
                  </tr>
                ))}
                {!d.sessions.length && (
                  <tr>
                    <td colSpan={5} className="muted">
                      還沒有練習
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>積分扣除紀錄</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>時間</th>
                  <th className="num">點數</th>
                </tr>
              </thead>
              <tbody>
                {d.redemptions.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtTime(r.created_at)}</td>
                    <td className="num">{r.points}</td>
                  </tr>
                ))}
                {!d.redemptions.length && (
                  <tr>
                    <td colSpan={2} className="muted">
                      沒有扣除紀錄
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
