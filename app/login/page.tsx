"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, api, getClientId, setAccessCode } from "@/lib/client";
import { AvatarPicker } from "@/components/AvatarPicker";

const GRADE_OPTIONS = [
  ["j1", "國一"],
  ["j2", "國二"],
  ["j3", "國三"],
  ["s1", "高一"],
  ["s2", "高二"],
  ["s3", "高三"],
] as const;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN 要是 4–6 位數字");
    if (mode === "register" && pin !== pin2) return setError("兩次輸入的 PIN 不一樣");
    setBusy(true);
    try {
      if (needCode) setAccessCode(code.trim());
      const body: Record<string, unknown> = { nickname, pin, anonId: getClientId() };
      if (mode === "register") {
        body.gradeLevel = gradeLevel || null;
        body.bio = bio.trim() || null;
      }
      await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
      // 帳號建好後再上傳頭像；頭像失敗不影響註冊，之後可在個人資料頁補傳
      if (mode === "register" && avatar) {
        await api("/api/me/avatar", { method: "PUT", body: JSON.stringify({ dataUrl: avatar }) }).catch(() => {});
      }
      window.location.href = mode === "register" && next === "/" ? "/?welcome=1" : next;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.message === "需要通行碼") setNeedCode(true);
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="card narrow login">
      <div className="seg tabs" role="tablist">
        <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
          登入
        </button>
        <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>
          建立帳號
        </button>
      </div>
      <form onSubmit={submit} className="login-form">
        <label>
          暱稱
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} autoComplete="username" maxLength={20} required />
        </label>
        <label>
          PIN（4–6 位數字）
          <input
            type="password"
            inputMode="numeric"
            pattern="\d{4,6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </label>
        {mode === "register" && (
          <label>
            再輸入一次 PIN
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              autoComplete="new-password"
              required
            />
          </label>
        )}
        {mode === "register" && (
          <fieldset className="fieldset">
            <legend>個人資料（都可以之後再填）</legend>
            <AvatarPicker nickname={nickname} version={0} preview={avatar} onPick={setAvatar} onRemove={() => setAvatar(null)} />
            <label>
              年級 <span className="optional">選填，會幫你預設國中或高中的文章</span>
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
              一句話介紹自己 <span className="optional">選填，最多 60 字</span>
              <input value={bio} maxLength={60} onChange={(e) => setBio(e.target.value)} placeholder="例：喜歡讀推理小說" />
            </label>
            <p className="muted small" style={{ margin: 0 }}>
              請不要填真實姓名、學校、電話或地址。
            </p>
          </fieldset>
        )}
        {mode === "register" && <p className="gift">🎁 註冊就送 100 個 Token，每次評分用 2 個。</p>}
        {needCode && (
          <label>
            網站通行碼
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
        )}
        {error && <p className="error small">{error}</p>}
        <button className="primary big" disabled={busy}>
          {busy ? "處理中…" : mode === "login" ? "登入" : "建立帳號並登入"}
        </button>
        <p className="muted small">
          {mode === "register"
            ? "積分跟著帳號走，換手機或電腦登入都看得到。這台瀏覽器之前的練習紀錄會自動併入新帳號。"
            : "忘記 PIN 請找家長或管理者重設。"}
        </p>
      </form>
    </section>
  );
}
