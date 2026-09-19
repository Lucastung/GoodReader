"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, getClientId, getPref, setPref } from "@/lib/client";
import type { Article } from "@/lib/db";
import { rowsToTree, type OutlineRow } from "@/lib/outline";
import { OutlineEditor, ResultView, type AttemptResult } from "@/components/practice";

type SessionData = {
  sessionId: string;
  grade: "junior" | "senior";
  article: Article;
  summaryRange: [number, number];
};

const hanCount = (s: string) => (s.match(/\p{Script=Han}/gu) || []).length;

export default function PracticePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<OutlineRow[]>([{ text: "", level: 0 }]);
  const [summary, setSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [hideArticle, setHideArticle] = useState(false);
  const draftKey = `rd.draft.${id}`;
  const loaded = useRef(false);

  useEffect(() => {
    api<SessionData>(`/api/sessions/${id}?clientId=${encodeURIComponent(getClientId())}`)
      .then((d) => {
        setData(d);
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            const draft = JSON.parse(raw) as { rows: OutlineRow[]; summary: string };
            if (draft.rows?.length) setRows(draft.rows);
            if (draft.summary) setSummary(draft.summary);
          }
        } catch {
          /* 沒有草稿 */
        }
        setHideArticle(getPref("closedBook") === "1");
        loaded.current = true;
      })
      .catch((e: Error) => setLoadError(e instanceof ApiError && e.status === 401 ? "需要通行碼，請回首頁輸入。" : e.message));
  }, [id, draftKey]);

  // 草稿自動存在這台瀏覽器
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ rows, summary }));
    } catch {
      /* 忽略 */
    }
  }, [rows, summary, draftKey]);

  const jumpTo = useCallback((pid?: string | null) => {
    if (!pid) return;
    setHideArticle(false);
    setHighlight(pid);
    requestAnimationFrame(() => document.getElementById(`para-${pid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, []);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await api<AttemptResult>(`/api/sessions/${id}/attempts`, {
        method: "POST",
        body: JSON.stringify({ clientId: getClientId(), outline: rowsToTree(rows), summary }),
      });
      setResult(r);
      setHistory((h) => [...h, r.total]);
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function nextArticle() {
    if (!data) return;
    const r = await api<{ sessionId: string }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ clientId: getClientId(), grade: data.grade }),
    });
    router.push(`/practice/${r.sessionId}`);
  }

  if (loadError) return <p className="error card">{loadError}</p>;
  if (!data) return <p className="muted card">載入文章中…</p>;

  const { article, summaryRange } = data;
  const sumChars = hanCount(summary);
  const isClassical = article.genre === "文言文";

  return (
    <div className="practice">
      <div className="work">
      <article className={`reader card ${hideArticle ? "collapsed" : ""}`}>
        <div className="reader-head">
          <div>
            <h1>{article.title}</h1>
            <p className="meta">
              {article.era}・{article.author}・{article.genre}・約 {article.charCount} 字
            </p>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={hideArticle}
              onChange={(e) => {
                setHideArticle(e.target.checked);
                setPref("closedBook", e.target.checked ? "1" : "0");
              }}
            />
            蓋起原文
          </label>
        </div>
        {!hideArticle && (
          <div className="text">
            {article.paragraphs.map((p) => (
              <p key={p.id} id={`para-${p.id}`} className={highlight === p.id ? "hl" : ""}>
                <span className="pid">{p.id}</span>
                {p.text}
              </p>
            ))}
          </div>
        )}
        <p className="source">
          {article.license === "public-domain" ? "公有領域作品" : article.license}
          {article.url && (
            <>
              ・<a href={article.url} target="_blank" rel="noreferrer">原文出處</a>
            </>
          )}
        </p>
      </article>

      <section className="answer card">
        <h2>大綱</h2>
        <p className="hint">
          一行一個重點，用 → ← 調整層級（最多 3 層）。{isClassical && "文言文請用白話寫。"}
        </p>
        <OutlineEditor rows={rows} onChange={setRows} />

        <h2>摘要</h2>
        <p className="hint">
          用自己的話寫，建議 {summaryRange[0]}–{summaryRange[1]} 字。{isClassical && "請用白話，不要整句照抄原文。"}
        </p>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={7}
          placeholder="這篇文章主要在說……"
          aria-label="摘要"
        />
        <p className={`count ${sumChars > summaryRange[1] ? "over" : ""}`}>{sumChars} 字</p>

        <button className="primary big" onClick={submit} disabled={submitting}>
          {submitting ? "老師批改中…（約 10–30 秒）" : result ? "修改後再評一次" : "送出評分"}
        </button>
        {submitError && <p className="error">{submitError}</p>}
      </section>
      </div>

      {result && (
        <ResultView result={result} history={history} onJump={jumpTo} onNext={nextArticle} grade={data.grade} />
      )}
    </div>
  );
}
