"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { AdminOnly, fmtDate, fmtTime } from "../AdminShell";
import { Avatar } from "@/components/Avatar";

const GRADE_LABEL: Record<string, string> = { j1: "國一", j2: "國二", j3: "國三", s1: "高一", s2: "高二", s3: "高三" };
const APP_LABEL: Record<string, string> = { goodreader: "好好讀書", freescript: "FreeScript", fishon: "FishOn", lucasact: "lucasact" };

type Row = {
  id: string;
  nickname: string;
  avatar_url: string;
  created_at: string;
  disabled: number;
  done: number;
  points: number;
  redeemed: number;
  last_active: string | null;
  last_seen_at: string;
  grade_level: string | null;
};
type Detail = {
  user: {
    id: string;
    nickname: string;
    avatar_url: string;
    created_at: string;
    last_seen_at: string;
    disabled: number;
    grade_level: string | null;
    bio: string | null;
    avatar_version: number;
  };
  account: { level: string; level_label: string; transfer_code: string; verified_age: number | null } | null;
  balance: { monthly: number; bought: number; total: number; unlimited: boolean };
  tokenHistory: { id: string; label: string; delta: number; balance_after: number; app: string; note: string; created_at: string }[];
  stats: { completed: number; totalPoints: number; redeemed: number; remaining: number; byDifficulty: { difficulty: number; count: number; avg: number | null }[] };
  sessions: { id: string; started_at: string; grade: string; mode: "basic" | "advanced"; title: string; difficulty: number; attempts: number; best: number | null }[];
  redemptions: { id: string; points: number; created_at: string }[];
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
          placeholder="搜尋名稱"
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
              <th>名稱</th>
              <th>年級</th>
              <th className="num">完成篇數</th>
              <th className="num">總積分</th>
              <th className="num">已扣除</th>
              <th className="num">剩餘</th>
              <th>最近練習</th>
              <th>最近來訪</th>
              <th>第一次來</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className={`click ${sel === u.id ? "sel" : ""}`} onClick={() => setSel(sel === u.id ? null : u.id)}>
                <td>
                  {u.nickname} {u.disabled ? <span className="badge off">停用</span> : null}
                </td>
                <td>{u.grade_level ? GRADE_LABEL[u.grade_level] : "—"}</td>
                <td className="num">{u.done}</td>
                <td className="num">{u.points}</td>
                <td className="num">{u.redeemed}</td>
                <td className="num">{u.points - u.redeemed}</td>
                <td>{fmtTime(u.last_active)}</td>
                <td>{fmtTime(u.last_seen_at)}</td>
                <td>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
            {data && !data.users.length && (
              <tr>
                <td colSpan={9} className="muted">
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
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/admin/users/${id}`).then(setD).catch((e) => setMsg({ ok: false, text: e.message }));
  }, [id]);
  useEffect(() => {
    setD(null);
    setMsg(null);
    load();
  }, [load]);

  async function act(body: Record<string, unknown>, done: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/admin/users/${id}`, { method: "POST", body: JSON.stringify(body) });
      setMsg({ ok: true, text: done });
      load();
      onChanged();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="panel muted">載入中…</div>;
  const u = d.user;
  return (
    <div className="panel">
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Avatar
          nickname={u.nickname}
          version={u.avatar_version}
          src={u.avatar_version > 0 ? `/api/admin/users/${u.id}/avatar?v=${u.avatar_version}` : u.avatar_url || null}
          size={56}
        />
        <div>
          <h3 style={{ margin: 0 }}>
            {u.nickname} {u.disabled ? <span className="badge off">停用</span> : null}
          </h3>
          <div className="small muted">
            {u.grade_level ? GRADE_LABEL[u.grade_level] : "未填年級"}
            {u.bio ? `・${u.bio}` : ""}
          </div>
        </div>
      </div>
      <p className="small muted">
        {d.account ? `${d.account.level_label}・轉贈碼 ${d.account.transfer_code}・` : "（lucasact 帳號已停用）・"}
        第一次來 {fmtTime(u.created_at)}・最近來訪 {fmtTime(u.last_seen_at)}・完成 {d.stats.completed} 篇・剩餘積分{" "}
        {d.stats.remaining}／{d.stats.totalPoints}
      </p>

      <div className="toolbar">
        {u.avatar_version > 0 && (
          <button
            className="btn danger"
            disabled={busy}
            onClick={() => act({ action: "removeAvatar" }, "頭像已移除", "確定移除這個頭像？（不當圖片時使用）")}
          >
            移除頭像
          </button>
        )}
        {u.disabled ? (
          <button className="btn ok" disabled={busy} onClick={() => act({ action: "enable" }, "帳號已啟用")}>
            啟用帳號
          </button>
        ) : (
          <button
            className="btn danger"
            disabled={busy}
            onClick={() => act({ action: "disable" }, "已在好好讀書停用", `確定在好好讀書停用「${u.nickname}」？停用後無法使用好好讀書，紀錄會保留；lucasact 帳號與其他應用不受影響。`)}
          >
            在好好讀書停用
          </button>
        )}
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}

      <h3>
        Token（{d.balance.unlimited ? "管理員不扣" : `餘額 ${d.balance.total}：本月發放 ${d.balance.monthly}＋購買 ${d.balance.bought}`}）
      </h3>
      <p className="small muted">全站共用的錢包。增加的 Token 不會過期；扣除只能扣購買來的部分。</p>
      <div className="toolbar">
        <input
          style={{ width: "8em" }}
          inputMode="numeric"
          placeholder="+50 或 -10"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d+-]/g, "").slice(0, 6))}
        />
        <input style={{ width: "auto", flex: 1, minWidth: 160 }} placeholder="原因（必填，例：活動獎勵、補償）" value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} />
        <button
          className="btn"
          disabled={busy || !Number(amount) || !note.trim()}
          onClick={() => {
            const n = Number(amount);
            act({ action: "adjustTokens", amount: n, note: note.trim() }, `已${n > 0 ? "增加" : "扣除"} ${Math.abs(n)} Token`).then((ok) => {
              if (!ok) return;
              setAmount("");
              setNote("");
            });
          }}
        >
          調整 Token
        </button>
      </div>
      <div className="tbl-wrap" style={{ marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>時間</th>
              <th>項目</th>
              <th className="num">增減</th>
              <th className="num">餘額</th>
            </tr>
          </thead>
          <tbody>
            {d.tokenHistory.map((t) => (
              <tr key={t.id}>
                <td>{fmtTime(t.created_at)}</td>
                <td className="wrap">
                  {t.label}
                  {t.note ? `：${t.note}` : ""}
                  {t.app && t.app !== "goodreader" ? <span className="muted small">（{APP_LABEL[t.app] ?? t.app}）</span> : null}
                </td>
                <td className="num">{t.delta > 0 ? `+${t.delta}` : t.delta}</td>
                <td className="num">{t.balance_after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="two">
        <div>
          <h3>練習紀錄（最近 50 次）</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>文章</th>
                  <th>模式</th>
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
                    <td>{s.mode === "basic" ? "基礎" : "進階"}</td>
                    <td className="num">{s.difficulty}</td>
                    <td className="num">{s.attempts}</td>
                    <td className="num">{s.best == null ? "—" : s.mode === "basic" ? `${s.best}/25` : s.best}</td>
                  </tr>
                ))}
                {!d.sessions.length && (
                  <tr>
                    <td colSpan={6} className="muted">
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
