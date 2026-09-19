"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api, getPref, setAccessCode, setPref } from "@/lib/client";
import type { Stats } from "@/lib/db";

type Me = { id: string; nickname: string; hasParentPin: boolean } | null;
type ArticleItem = { id: string; title: string; author: string; era: string | null; genre: string; difficulty: number; char_count: number; best: number | null };

const GENRE_OPTIONS = ["全部", "文言文", "散文", "記敘文"];

export default function Home() {
  const router = useRouter();
  const [grade, setGrade] = useState<"junior" | "senior">("junior");
  const [genre, setGenre] = useState("全部");
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    const g = getPref("grade");
    if (g === "junior" || g === "senior") setGrade(g);
    load();
  }, []);

  async function load() {
    try {
      const [a, m] = await Promise.all([
        api<{ articles: ArticleItem[] }>("/api/articles"),
        api<{ user: Me }>("/api/auth/me"),
      ]);
      setArticles(a.articles);
      setMe(m.user);
      if (m.user) setStats(await api<Stats>("/api/me/stats"));
      setNeedCode(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedCode(true);
      else setError((e as Error).message);
    }
  }

  async function start(articleId?: string) {
    if (!me) {
      window.location.href = "/login?next=/";
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sessionId: string }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          grade,
          genre: genre === "全部" ? undefined : genre,
          articleId,
        }),
      });
      router.push(`/practice/${r.sessionId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedCode(true);
      else setError((e as Error).message);
      setBusy(false);
    }
  }

  function chooseGrade(g: "junior" | "senior") {
    setGrade(g);
    setPref("grade", g);
  }

  if (needCode) {
    return (
      <section className="card narrow">
        <h1>請輸入通行碼</h1>
        <p className="muted">這個網站有設定通行碼，請向管理者索取。</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAccessCode(code.trim());
            load();
          }}
          className="row"
        >
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="通行碼" aria-label="通行碼" />
          <button className="primary">確定</button>
        </form>
      </section>
    );
  }

  const shown = articles.filter((a) => genre === "全部" || a.genre === genre);

  return (
    <div className="home">
      {me === undefined ? (
        <section className="card dash muted">載入中…</section>
      ) : me ? (
        <Dashboard
          stats={stats}
          hasParentPin={me.hasParentPin}
          onChange={(s) => {
            setStats(s);
            setMe({ ...me, hasParentPin: true });
          }}
        />
      ) : (
        <section className="card dash login-cta">
          <div>
            <b>登入後開始累積積分</b>
            <p className="muted small">用暱稱＋PIN 建立帳號，換手機或電腦都看得到自己的成績。</p>
          </div>
          <a className="primary as-button" href="/login">
            登入／建立帳號
          </a>
        </section>
      )}

      <section className="card picker">
        <div className="seg" role="radiogroup" aria-label="年級">
          {(
            [
              ["junior", "國中"],
              ["senior", "高中"],
            ] as const
          ).map(([v, t]) => (
            <button key={v} role="radio" aria-checked={grade === v} className={grade === v ? "on" : ""} onClick={() => chooseGrade(v)}>
              {t}
            </button>
          ))}
        </div>
        <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="文體">
          {GENRE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g === "全部" ? "全部" : g}
            </option>
          ))}
        </select>
        <button className="primary" disabled={busy} onClick={() => start()}>
          {busy ? "抽文章中…" : "隨機抽一篇"}
        </button>
      </section>
      {error && <p className="error">{error}</p>}

      <section className="list-pane" aria-label="文章清單">
        <ul className="article-list">
          {shown.map((a) => (
            <li key={a.id}>
              <button className={`article-item ${a.best != null ? "done" : ""}`} disabled={busy} onClick={() => start(a.id)}>
                <span className="title">
                  {a.title}
                  {a.best != null && (
                    <span className="done-mark" title="已評過，積分以這篇的最高分計，重做不會重複加分">
                      ✓ 已評 {a.best} 分
                    </span>
                  )}
                </span>
                <span className="meta">
                  {a.era}・{a.author}・{a.genre}・約 {a.char_count} 字
                </span>
                <span className="stars" aria-label={`難度 ${a.difficulty}`}>
                  {"●".repeat(a.difficulty)}
                  <span className="dim">{"●".repeat(5 - a.difficulty)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Dashboard({
  stats,
  hasParentPin,
  onChange,
}: {
  stats: Stats | null;
  hasParentPin: boolean;
  onChange: (s: Stats) => void;
}) {
  const [amount, setAmount] = useState("");
  const [parentPin, setParentPin] = useState("");
  const [parentPin2, setParentPin2] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const s = stats ?? {
    completed: 0,
    byDifficulty: [1, 2, 3, 4, 5].map((d) => ({ difficulty: d, count: 0, avg: null })),
    totalPoints: 0,
    redeemed: 0,
    remaining: 0,
  };
  const pts = Number(amount);
  const valid = Number.isInteger(pts) && pts > 0 && pts <= s.remaining;

  const pinOk = /^\d{4,6}$/.test(parentPin) && (hasParentPin || parentPin === parentPin2);

  function cancel() {
    setConfirming(false);
    setParentPin("");
    setParentPin2("");
  }

  async function redeem() {
    setSaving(true);
    setMsg(null);
    try {
      const next = await api<Stats>("/api/me/redeem", {
        method: "POST",
        body: JSON.stringify({ points: pts, parentPin, setupParentPin: !hasParentPin }),
      });
      onChange(next);
      setMsg(`已扣除 ${pts} 點`);
      setAmount("");
      cancel();
    } catch (e) {
      setMsg((e as Error).message);
      setParentPin("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card dash" aria-label="我的學習概況">
      <div className="dash-row">
        <div className="stat">
          <span className="stat-label">完成篇數</span>
          <span className="stat-num">{s.completed}</span>
          <span className="stat-unit">篇</span>
        </div>
        <DifficultyChart data={s.byDifficulty} />
      </div>
      <div className="dash-row points">
        <div className="stat">
          <span className="stat-label">剩餘積分 / 總積分</span>
          <span className="stat-num">
            {s.remaining}
            <span className="of"> / {s.totalPoints}</span>
          </span>
        </div>
        <div className="redeem">
          {confirming ? (
            <form
              className="redeem-confirm"
              onSubmit={(e) => {
                e.preventDefault();
                if (pinOk) redeem();
              }}
            >
              <span className="small">
                扣除 {pts} 點。{hasParentPin ? "請家長輸入 PIN：" : "第一次扣除，請家長設定 PIN（4–6 位數字）："}
              </span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={parentPin}
                onChange={(e) => setParentPin(e.target.value.replace(/\D/g, ""))}
                placeholder="家長 PIN"
                aria-label="家長 PIN"
                autoComplete="off"
                autoFocus
              />
              {!hasParentPin && (
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={parentPin2}
                  onChange={(e) => setParentPin2(e.target.value.replace(/\D/g, ""))}
                  placeholder="再輸入一次"
                  aria-label="再輸入一次家長 PIN"
                  autoComplete="off"
                />
              )}
              <button className="primary" disabled={saving || !pinOk}>
                {saving ? "處理中…" : "確定扣除"}
              </button>
              <button type="button" className="ghost" onClick={cancel} disabled={saving}>
                取消
              </button>
            </form>
          ) : (
            <>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={s.remaining}
                step={1}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setMsg(null);
                }}
                placeholder="點數"
                aria-label="本次要扣除（折現）的點數"
              />
              <button className="primary" onClick={() => setConfirming(true)} disabled={!valid}>
                扣除
              </button>
            </>
          )}
        </div>
      </div>
      {msg && <p className="small muted dash-msg">{msg}</p>}
      {amount !== "" && !valid && !confirming && (
        <p className="small error dash-msg">請輸入 1–{s.remaining} 之間的整數</p>
      )}
    </section>
  );
}

/** 各難度平均分（0–100）直條圖；沒做過的難度顯示「—」 */
function DifficultyChart({ data }: { data: Stats["byDifficulty"] }) {
  return (
    <figure className="dchart" aria-label="各難度平均評分">
      <figcaption>各難度平均評分</figcaption>
      <div className="dchart-plot">
        {data.map((d) => (
          <div
            key={d.difficulty}
            className="dchart-col"
            title={d.avg == null ? `難度 ${d.difficulty}：尚未練習` : `難度 ${d.difficulty}：平均 ${d.avg} 分（${d.count} 篇）`}
          >
            <span className="dchart-val">{d.avg ?? "—"}</span>
            <div className="dchart-track">
              {d.avg != null && <div className="dchart-bar" style={{ height: `${Math.max(2, d.avg)}%` }} />}
            </div>
            <span className="dchart-x">{d.difficulty}</span>
          </div>
        ))}
      </div>
      <span className="dchart-axis">難度</span>
      <table className="sr-only">
        <caption>各難度平均評分</caption>
        <thead>
          <tr>
            <th>難度</th>
            <th>平均分</th>
            <th>篇數</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.difficulty}>
              <td>{d.difficulty}</td>
              <td>{d.avg ?? "—"}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
