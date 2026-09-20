"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, getPref } from "@/lib/client";
import type { Article } from "@/lib/db";
import { rowsToTree, type OutlineRow } from "@/lib/outline";
import { OutlineEditor, ResultView, type AttemptResult } from "@/components/practice";
import { MicButton, useDictationTarget, useReadAloud } from "@/components/speech";
import { ArticleReader } from "@/components/reader";
import { QuizPractice, type QuizSessionData } from "@/components/quiz";
import { refreshUserMenu } from "@/components/UserMenu";

const GRADE_COST = 2;

type SessionData = {
  sessionId: string;
  grade: "junior" | "senior";
  mode: "advanced";
  article: Article;
  summaryRange: [number, number];
  /** 之前其他次練習這篇的最高分；null = 第一次做 */
  previousBest: number | null;
  tokens: number;
  unlimited?: boolean;
};

const NO_PARAGRAPHS: Article["paragraphs"] = [];
const hanCount = (s: string) => (s.match(/\p{Script=Han}/gu) || []).length;

export default function PracticePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(null);
  const [quizData, setQuizData] = useState<QuizSessionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<OutlineRow[]>([{ text: "", level: 0 }]);
  const [summary, setSummary] = useState("");
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const dictSummary = useDictationTarget(() => summaryRef.current, setSummary);
  const reader = useReadAloud(data?.article.paragraphs ?? NO_PARAGRAPHS, data?.article.title);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [hideArticle, setHideArticle] = useState(false);
  const draftKey = `rd.draft.${id}`;
  const loaded = useRef(false);

  useEffect(() => {
    api<SessionData | QuizSessionData>(`/api/sessions/${id}`)
      .then((d) => {
        if (d.mode === "basic") {
          setQuizData(d);
          return;
        }
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
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 401 && e.message === "請先登入") {
          window.location.href = `/login?next=${encodeURIComponent(`/practice/${id}`)}`;
          return;
        }
        setLoadError(e instanceof ApiError && e.status === 401 ? "需要通行碼，請回首頁輸入。" : e.message);
      });
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
        body: JSON.stringify({ outline: rowsToTree(rows), summary }),
      });
      setResult(r);
      setData((d) => (d ? { ...d, tokens: r.tokens ?? d.tokens } : d));
      refreshUserMenu();
      setHistory((h) => [...h, r.total]);
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) {
      setSubmitError((e as Error).message);
      refreshUserMenu(); // 失敗會退回 Token，頁首重新讀
    } finally {
      setSubmitting(false);
    }
  }

  async function nextArticle() {
    if (!data) return;
    const r = await api<{ sessionId: string }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ grade: data.grade, mode: "advanced" }),
    });
    router.push(`/practice/${r.sessionId}`);
  }

  if (loadError) return <p className="error card">{loadError}</p>;
  if (quizData) return <QuizPractice initial={quizData} />;
  if (!data) return <p className="muted card">載入文章中…</p>;

  const { article, summaryRange } = data;
  const sumChars = hanCount(summary);
  const isClassical = article.genre === "文言文";

  return (
    <div className="practice">
      {data.previousBest != null && (
        <p className="redo-note">
          ✓ 你之前評過這篇（最高 {data.previousBest} 分）。每篇只計分一次，重做不會重複加分；這次如果超過 {data.previousBest} 分，只補上差額。
        </p>
      )}
      <div className="work">
      <ArticleReader
        article={article}
        reader={reader}
        hideArticle={hideArticle}
        onHideChange={setHideArticle}
        highlight={highlight}
      />

      <section className="answer card">
        <h2>大綱</h2>
        <p className="hint">
          一行一個重點。拖左邊的圓點調整層級（最多 3 層）和順序。{isClassical && "文言文請用白話寫。"}
        </p>
        <OutlineEditor rows={rows} onChange={setRows} />

        <div className="field-head">
          <h2>摘要</h2>
          <MicButton onText={dictSummary} label="語音輸入摘要" />
        </div>
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

        <button className="primary big" onClick={submit} disabled={submitting || (!data.unlimited && data.tokens < GRADE_COST)}>
          {submitting
            ? "老師批改中…（約 10–30 秒）"
            : `${result ? "修改後再評一次" : "送出評分"}${data.unlimited ? "" : `（用 ${GRADE_COST} Token，剩 ${data.tokens}）`}`}
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
