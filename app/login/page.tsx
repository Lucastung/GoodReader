"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";

type AuthInfo = { user: { id: string } | null; login: { google: string; facebook: string } };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginBox />
    </Suspense>
  );
}

const ERRORS: Record<string, string> = {
  cancelled: "登入已取消。",
  state: "登入逾時或連結失效，請再試一次。",
  failed: "登入失敗，請再試一次。",
  disabled: "這個帳號已停用，請聯絡管理者。",
};

/** 在好好讀書直接登入：按鈕連到 lucasact 帳號服務的 Google 登入，登完回到好好讀書 */
function LoginBox() {
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") && !params.get("next")!.startsWith("//") ? params.get("next")! : "/";
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") ?? ""] ?? null);

  useEffect(() => {
    api<AuthInfo>(`/api/auth/me?next=${encodeURIComponent(next)}`)
      .then((r) => {
        if (r.user) window.location.href = next; // 已經登入（例如在 lucasact.com 登過）就直接回去
        else setInfo(r);
      })
      .catch((e) => setError((e as Error).message));
  }, [next]);

  return (
    <section className="card narrow login">
      <h1 style={{ marginTop: 0 }}>登入好好讀書</h1>
      <p className="muted">用 Google 帳號登入，換手機或電腦都看得到自己的成績。</p>
      <a className={`primary big as-button google-btn ${info ? "" : "disabled"}`} href={info?.login.google ?? "#"} aria-disabled={!info}>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        用 Google 登入
      </a>
      {error && <p className="error small">{error}</p>}
      <p className="gift">🪙 每個月送 Token，每次評分用 2 個。</p>
      <p className="muted small">
        這是 LUCAS 的共用帳號：好好讀書、FreeScript、FishOn 用同一個帳號和 Token 錢包，在
        <a href="https://lucasact.com/"> lucasact.com </a>
        可以加值、轉贈 Token。
      </p>
    </section>
  );
}
