"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, api, getClientId, setAccessCode } from "@/lib/client";

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN 要是 4–6 位數字");
    if (mode === "register" && pin !== pin2) return setError("兩次輸入的 PIN 不一樣");
    setBusy(true);
    try {
      if (needCode) setAccessCode(code.trim());
      await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ nickname, pin, anonId: getClientId() }),
      });
      window.location.href = next;
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
