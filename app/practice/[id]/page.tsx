"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, getClientId, getPref, setPref } from "@/lib/client";
import type { Article } from "@/lib/db";
import type { GradeResult } from "@/lib/grader";
import { MAX_LEVEL, normalizeRows, rowsToTree, type OutlineRow } from "@/lib/outline";
import type { OutlineNode } from "@/lib/schemas";

type SessionData = {
  sessionId: string;
  grade: "junior" | "senior";
  article: Article;
  summaryRange: [number, number];
};

type AttemptResult = GradeResult & { attemptId: string; readSeconds: number };

const hanCount = (s: string) => (s.match(/\p{Script=Han}/gu) || []).length;
const LEVEL_CLASS: Record<string, string> = { 優: "lv-a", 良: "lv-b", 尚可: "lv-c", 待加強: "lv-d" };

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

function OutlineEditor({ rows, onChange }: { rows: OutlineRow[]; onChange: (r: OutlineRow[]) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  useEffect(() => {
    if (focusIdx != null) refs.current[focusIdx]?.focus();
  }, [focusIdx, rows.length]);

  const update = (next: OutlineRow[]) => onChange(normalizeRows(next));
  const setText = (i: number, text: string) => update(rows.map((r, j) => (j === i ? { ...r, text } : r)));
  const shift = (i: number, d: number) =>
    update(rows.map((r, j) => (j === i ? { ...r, level: Math.max(0, Math.min(MAX_LEVEL, r.level + d)) } : r)));
  const insertAfter = (i: number) => {
    const next = [...rows];
    next.splice(i + 1, 0, { text: "", level: rows[i]?.level ?? 0 });
    update(next);
    setFocusIdx(i + 1);
  };
  const remove = (i: number) => {
    if (rows.length === 1) return update([{ text: "", level: 0 }]);
    update(rows.filter((_, j) => j !== i));
    setFocusIdx(Math.max(0, i - 1));
  };

  return (
    <div className="outline">
      {rows.map((r, i) => (
        <div key={i} className="outline-row" style={{ paddingLeft: `${r.level * 1.5}rem` }}>
          <span className="bullet">{["●", "○", "▪"][r.level]}</span>
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={r.text}
            onChange={(e) => setText(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return; // 注音輸入選字時不處理
              if (e.key === "Enter") {
                e.preventDefault();
                insertAfter(i);
              } else if (e.key === "Tab") {
                e.preventDefault();
                shift(i, e.shiftKey ? -1 : 1);
              } else if (e.key === "Backspace" && r.text === "" && rows.length > 1) {
                e.preventDefault();
                remove(i);
              }
            }}
            placeholder={i === 0 ? "例：第一段：漁人發現桃花林" : ""}
            aria-label={`大綱第 ${i + 1} 條`}
          />
          <div className="row-tools">
            <button type="button" onClick={() => shift(i, -1)} disabled={r.level === 0} aria-label="往外一層">
              ←
            </button>
            <button type="button" onClick={() => shift(i, 1)} disabled={r.level >= MAX_LEVEL || i === 0} aria-label="往內一層">
              →
            </button>
            <button type="button" onClick={() => remove(i)} aria-label="刪除">
              ×
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="ghost" onClick={() => insertAfter(rows.length - 1)}>
        ＋ 新增一條
      </button>
    </div>
  );
}

function ResultView({
  result,
  history,
  onJump,
  onNext,
  grade,
}: {
  result: AttemptResult;
  history: number[];
  onJump: (pid?: string | null) => void;
  onNext: () => void;
  grade: "junior" | "senior";
}) {
  const [showRef, setShowRef] = useState(false);
  const outlineMax = useMemo(
    () => result.items.filter((i) => i.criterion.startsWith("outline")).reduce((n, i) => n + i.max, 0),
    [result.items],
  );

  return (
    <section id="result" className="result card">
      <div className="score-head">
        <div className="total">
          <span className="num">{result.total}</span>
          <span className="of">/ 100</span>
        </div>
        <div className="muted small">
          {grade === "junior" ? "國中" : "高中"}配分：大綱 {outlineMax}、摘要 {100 - outlineMax}
          {history.length > 1 && <div>本篇歷次：{history.join(" → ")}</div>}
          <div>摘要與原文重疊率 {Math.round(result.copyRatio * 100)}%</div>
        </div>
      </div>

      <ul className="criteria">
        {result.items.map((it) => (
          <li key={it.criterion}>
            <div className="crit-head">
              <span>{it.label}</span>
              <span className={`level ${LEVEL_CLASS[it.level]}`}>{it.level}</span>
              <span className="pts">
                {it.score}/{it.max}
              </span>
            </div>
            <div className="bar">
              <div style={{ width: `${(it.score / it.max) * 100}%` }} />
            </div>
            <p>{it.reason}</p>
          </li>
        ))}
      </ul>

      {result.strengths.length > 0 && (
        <>
          <h3>做得好的地方</h3>
          <ul className="plain">
            {result.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {result.keyPointsMissed.length > 0 && (
        <>
          <h3>可能漏掉的重點</h3>
          <ul className="plain">
            {result.keyPointsMissed.map((m, i) => (
              <li key={i}>
                {m.hint}
                {m.paragraph && (
                  <button className="link" onClick={() => onJump(m.paragraph)}>
                    看 {m.paragraph}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.errors.length > 0 && (
        <>
          <h3>和原文不符的地方</h3>
          <ul className="plain">
            {result.errors.map((e, i) => (
              <li key={i}>
                「{e.quote}」— {e.issue}
                {e.paragraph && (
                  <button className="link" onClick={() => onJump(e.paragraph)}>
                    看 {e.paragraph}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="next-step">下一步：{result.nextStep}</p>

      <button className="ghost" onClick={() => setShowRef((v) => !v)}>
        {showRef ? "收起參考答案" : "看參考答案"}
      </button>
      {showRef && (
        <div className="reference">
          <p>
            <b>中心思想：</b>
            {result.reference.centralIdea}
          </p>
          <p>
            <b>結構：</b>
            {result.reference.structure}
          </p>
          {result.reference.vernacular && (
            <p>
              <b>白話大意：</b>
              {result.reference.vernacular}
            </p>
          )}
          <b>參考大綱：</b>
          <OutlineTree nodes={result.reference.outline} />
        </div>
      )}

      <div className="actions">
        <button className="primary" onClick={onNext}>
          換一篇
        </button>
      </div>
      <p className="muted small">
        評分模型：{result.model}・評分標準版本 {result.rubricVersion}
      </p>
    </section>
  );
}

function OutlineTree({ nodes }: { nodes: OutlineNode[] }) {
  return (
    <ul className="tree">
      {nodes.map((n, i) => (
        <li key={i}>
          {n.text}
          {n.children && n.children.length > 0 && <OutlineTree nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}
