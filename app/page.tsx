"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api, getPref, setAccessCode, setPref } from "@/lib/client";
import type { Stats } from "@/lib/db";

type Me = { id: string; nickname: string; gradeLevel: string | null; tokens: number; unlimited: boolean } | null;
type ArticleItem = {
  id: string;
  title: string;
  author: string;
  era: string | null;
  genre: string;
  difficulty: number;
  char_count: number;
  /** 進階最高分 */
  best: number | null;
  /** 閱讀測驗分數（滿分 25） */
  quiz: number | null;
};
type Mode = "basic" | "advanced";

const GENRE_OPTIONS = ["全部", "文言文", "散文", "記敘文"];

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("basic");
  const [genre, setGenre] = useState("全部");
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [welcome, setWelcome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    const m = getPref("mode");
    if (m === "basic" || m === "advanced") setMode(m);
    else if (getPref("grade") === "senior") setMode("advanced"); // 舊版記的是國中／高中
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
      // 沒選過模式時，依個人資料的年級預設：國中→基礎、高中→進階
      if (m.user?.gradeLevel && !getPref("mode")) setMode(m.user.gradeLevel.startsWith("s") ? "advanced" : "basic");
      if (new URLSearchParams(window.location.search).get("welcome")) setWelcome(true);
      if (m.user) setStats(await api<Stats>("/api/me/stats"));
      setNeedCode(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedCode(true);
      else setError((e as Error).message);
    }
  }

  async function start(articleId?: string) {
    if (!me) {
      window.location.href = "/login";
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sessionId: string }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          grade: gradeFor(me.gradeLevel, mode),
          mode,
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

  function chooseMode(m: Mode) {
    setMode(m);
    setPref("mode", m);
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
      {welcome && me && (
        <p className="gift" role="status">
          🎉 歡迎，{me.nickname}！你有 {me.unlimited ? "不限" : me.tokens} 個 Token，每次評分用 2 個。選一篇文章開始吧。
        </p>
      )}
      {me && !me.unlimited && me.tokens < 2 && (
        <p className="error small" role="status">
          Token 不足（剩 {me.tokens} 個），暫時不能評分。每月 1 日會補發，或到{" "}
          <a href="https://lucasact.com/token.html">lucasact.com</a> 加值。
        </p>
      )}
      {me === undefined ? (
        <section className="card dash muted">載入中…</section>
      ) : me ? (
        <Dashboard stats={stats} mode={mode} onChange={setStats} />
      ) : (
        <section className="card dash login-cta">
          <div>
            <b>登入後開始累積積分</b>
            <p className="muted small">用 Google 帳號登入，換手機或電腦都看得到自己的成績。</p>
          </div>
          <a className="primary as-button" href="/login">
            登入
          </a>
        </section>
      )}

      <section className="card picker">
        <div className="seg mode-seg" role="radiogroup" aria-label="練習模式">
          {(
            [
              ["basic", "基礎", "閱讀測驗"],
              ["advanced", "進階", "大綱＋摘要"],
            ] as const
          ).map(([v, t, sub]) => (
            <button key={v} role="radio" aria-checked={mode === v} className={mode === v ? "on" : ""} onClick={() => chooseMode(v)}>
              {t}
              <small>{sub}</small>
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
          {busy ? (mode === "basic" ? "出題中…" : "抽文章中…") : "隨機抽一篇"}
        </button>
      </section>
      {error && <p className="error">{error}</p>}

      <section className="list-pane" aria-label="文章清單">
        <ul className="article-list">
          {shown.map((a) => {
            const done = mode === "basic" ? a.quiz : a.best;
            return (
            <li key={a.id}>
              <button className={`article-item ${done != null ? "done" : ""}`} disabled={busy} onClick={() => start(a.id)}>
                <span className="title">
                  {a.title}
                  {done != null &&
                    (mode === "basic" ? (
                      <span className="done-mark" title="閱讀測驗每篇只能作答一次，點進去可以看解析">
                        ✓ 已測驗 {done}/25
                      </span>
                    ) : (
                      <span className="done-mark" title="已評過，積分以這篇的最高分計，重做不會重複加分">
                        ✓ 已評 {done} 分
                      </span>
                    ))}
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
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** 送給後端的年級（決定抽文章的難度範圍與進階配分）：有填個人資料就照年級，沒填就依模式 */
function gradeFor(gradeLevel: string | null | undefined, mode: Mode): "junior" | "senior" {
  if (gradeLevel) return gradeLevel.startsWith("s") ? "senior" : "junior";
  return mode === "basic" ? "junior" : "senior";
}

function Dashboard({
  stats,
  mode,
  onChange,
}: {
  stats: Stats | null;
  mode: Mode;
  onChange: (s: Stats) => void;
}) {
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const empty = [1, 2, 3, 4, 5].map((d) => ({ difficulty: d, count: 0, avg: null }));
  const s: Stats = stats ?? {
    completed: 0,
    byDifficulty: empty,
    byDifficultyBasic: empty,
    totalPoints: 0,
    redeemed: 0,
    remaining: 0,
  };
  const pts = Number(amount);
  const valid = Number.isInteger(pts) && pts > 0 && pts <= s.remaining;

  function cancel() {
    setConfirming(false);
  }

  async function redeem() {
    setSaving(true);
    setMsg(null);
    try {
      const next = await api<Stats>("/api/me/redeem", {
        method: "POST",
        body: JSON.stringify({ points: pts }),
      });
      onChange(next);
      setMsg(`已扣除 ${pts} 點`);
      setAmount("");
      cancel();
    } catch (e) {
      setMsg((e as Error).message);
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
        {mode === "basic" ? (
          <DifficultyChart data={s.byDifficultyBasic ?? empty} max={25} caption="各難度平均分（基礎・閱讀測驗，滿分 25）" />
        ) : (
          <DifficultyChart data={s.byDifficulty} max={100} caption="各難度平均評分（進階，滿分 100）" />
        )}
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
                redeem();
              }}
            >
              <span className="small">確定扣除 {pts} 點？</span>
              <button className="primary" disabled={saving} autoFocus>
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

/** 各難度平均分直條圖；沒做過的難度顯示「—」 */
function DifficultyChart({ data, max, caption }: { data: Stats["byDifficulty"]; max: number; caption: string }) {
  return (
    <figure className="dchart" aria-label={caption}>
      <figcaption>{caption}</figcaption>
      <div className="dchart-plot">
        {data.map((d) => (
          <div
            key={d.difficulty}
            className="dchart-col"
            title={d.avg == null ? `難度 ${d.difficulty}：尚未練習` : `難度 ${d.difficulty}：平均 ${d.avg} 分（${d.count} 篇）`}
          >
            <span className="dchart-val">{d.avg ?? "—"}</span>
            <div className="dchart-track">
              {d.avg != null && <div className="dchart-bar" style={{ height: `${Math.max(2, (d.avg / max) * 100)}%` }} />}
            </div>
            <span className="dchart-x">{d.difficulty}</span>
          </div>
        ))}
      </div>
      <span className="dchart-axis">難度</span>
      <table className="sr-only">
        <caption>{caption}</caption>
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
