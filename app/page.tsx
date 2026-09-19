"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api, getClientId, getPref, setAccessCode, setPref } from "@/lib/client";

type ArticleItem = { id: string; title: string; author: string; era: string | null; genre: string; difficulty: number; char_count: number };

const GENRE_OPTIONS = ["全部", "文言文", "散文", "記敘文"];

export default function Home() {
  const router = useRouter();
  const [grade, setGrade] = useState<"junior" | "senior">("junior");
  const [genre, setGenre] = useState("全部");
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    const g = getPref("grade");
    if (g === "junior" || g === "senior") setGrade(g);
    loadArticles();
  }, []);

  async function loadArticles() {
    try {
      const r = await api<{ articles: ArticleItem[] }>("/api/articles");
      setArticles(r.articles);
      setNeedCode(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedCode(true);
      else setError((e as Error).message);
    }
  }

  async function start(articleId?: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sessionId: string }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          clientId: getClientId(),
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
        <p className="muted">這個 demo 有設定通行碼，請向管理者索取。</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAccessCode(code.trim());
            loadArticles();
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
      <section className="hero">
        <h1>讀一篇，寫下大綱與摘要</h1>
        <p className="muted">
          系統會抽一篇經典文章給你。讀完後整理出大綱、寫一段摘要，AI 老師會對照原文告訴你抓到了哪些重點、漏了什麼。
        </p>
      </section>

      <section className="card">
        <div className="field">
          <span className="label">年級</span>
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
        </div>
        <div className="field">
          <span className="label">文體</span>
          <div className="seg" role="radiogroup" aria-label="文體">
            {GENRE_OPTIONS.map((g) => (
              <button key={g} role="radio" aria-checked={genre === g} className={genre === g ? "on" : ""} onClick={() => setGenre(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <button className="primary big" disabled={busy} onClick={() => start()}>
          {busy ? "抽文章中…" : "隨機抽一篇開始"}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      <section>
        <h2 className="section-title">或自己挑一篇</h2>
        <ul className="article-list">
          {shown.map((a) => (
            <li key={a.id}>
              <button className="article-item" disabled={busy} onClick={() => start(a.id)}>
                <span className="title">{a.title}</span>
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
