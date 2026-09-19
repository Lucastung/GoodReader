"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/client";
import { AvatarPicker } from "@/components/AvatarPicker";
import { refreshUserMenu } from "@/components/UserMenu";

type Me = { id: string; nickname: string; gradeLevel: string | null; bio: string | null; avatarVersion: number; tokens: number };
type Ledger = { id: string; delta: number; balance_after: number; reason: string; note: string | null; created_at: string };

const GRADE_OPTIONS = [
  ["j1", "國一"],
  ["j2", "國二"],
  ["j3", "國三"],
  ["s1", "高一"],
  ["s2", "高二"],
  ["s3", "高三"],
] as const;
const REASON: Record<string, string> = { signup: "註冊禮", grade: "評分", refund: "評分失敗退回", admin: "管理者調整", purchase: "購買" };
const fmt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function MePage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [tokens, setTokens] = useState<{ balance: number; history: Ledger[]; gradeCost: number } | null>(null);
  const [nickname, setNickname] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [bio, setBio] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ user: Me | null }>("/api/auth/me");
      setMe(r.user);
      if (!r.user) return;
      setNickname(r.user.nickname);
      setGradeLevel(r.user.gradeLevel ?? "");
      setBio(r.user.bio ?? "");
      setTokens(await api("/api/me/tokens"));
    } catch {
      setMe(null);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (me === undefined) return <p className="muted">載入中…</p>;
  if (!me)
    return (
      <div className="card narrow">
        <p>請先登入。</p>
        <Link href="/login?next=/me" className="primary" style={{ textDecoration: "none", display: "inline-block" }}>
          登入
        </Link>
      </div>
    );

  const dirty = nickname.trim() !== me.nickname || gradeLevel !== (me.gradeLevel ?? "") || bio.trim() !== (me.bio ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/me/profile", {
        method: "PUT",
        body: JSON.stringify({ nickname: nickname.trim(), gradeLevel: gradeLevel || null, bio: bio.trim() || null }),
      });
      setMsg({ ok: true, text: "已儲存" });
      await load();
      refreshUserMenu();
    } catch (x) {
      setMsg({ ok: false, text: (x as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(dataUrl: string) {
    setBusy(true);
    setAvatarMsg(null);
    try {
      await api("/api/me/avatar", { method: "PUT", body: JSON.stringify({ dataUrl }) });
      setAvatarMsg({ ok: true, text: "頭像已更新" });
      await load();
      refreshUserMenu();
    } catch (x) {
      setAvatarMsg({ ok: false, text: x instanceof ApiError ? x.message : "上傳失敗" });
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    await api("/api/me/avatar", { method: "DELETE" }).catch(() => {});
    await load();
    refreshUserMenu();
    setBusy(false);
  }

  return (
    <div className="profile">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>個人資料</h2>
        <AvatarPicker nickname={me.nickname} version={me.avatarVersion} preview={null} onPick={uploadAvatar} onRemove={removeAvatar} busy={busy} />
        {avatarMsg && <p className={`msg small ${avatarMsg.ok ? "" : "error"}`}>{avatarMsg.text}</p>}
        <form className="profile-form" onSubmit={save} style={{ marginTop: 14 }}>
          <label>
            暱稱（登入用）
            <input value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} required />
          </label>
          <label>
            年級
            <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}>
              <option value="">不填</option>
              {GRADE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            一句話介紹自己
            <input value={bio} maxLength={60} onChange={(e) => setBio(e.target.value)} placeholder="例：喜歡讀推理小說" />
          </label>
          <p className="muted small" style={{ margin: 0 }}>
            請不要填真實姓名、學校、電話或地址。改了暱稱，下次要用新暱稱登入。
          </p>
          <div className="row" style={{ alignItems: "center" }}>
            <button className="primary" disabled={busy || !dirty}>
              儲存
            </button>
            {msg && <span className={`small ${msg.ok ? "muted" : "error"}`}>{msg.text}</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="token-head">
          <div>
            <div className="muted small">Token 餘額</div>
            <div className="token-big">🪙 {tokens?.balance ?? me.tokens}</div>
          </div>
          <button className="btn-outline" disabled title="即將推出">
            購買 Token（即將推出）
          </button>
        </div>
        <p className="muted small">每次送出評分用 {tokens?.gradeCost ?? 2} 個 Token；評分失敗會自動退回。</p>
        <h3>最近紀錄</h3>
        <ul className="ledger">
          {tokens?.history.map((h) => (
            <li key={h.id}>
              <span className="what">
                {REASON[h.reason] ?? h.reason}
                {h.note && h.reason !== "signup" ? `：${h.note}` : ""}
                <small>
                  {fmt(h.created_at)}・餘額 {h.balance_after}
                </small>
              </span>
              <span className={`d ${h.delta > 0 ? "plus" : "minus"}`}>
                {h.delta > 0 ? "+" : ""}
                {h.delta}
              </span>
            </li>
          ))}
          {tokens && !tokens.history.length && <li className="muted">還沒有紀錄</li>}
        </ul>
      </section>
    </div>
  );
}
