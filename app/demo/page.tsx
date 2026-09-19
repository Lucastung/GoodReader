"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { OutlineEditor, ResultView, type AttemptResult } from "@/components/practice";
import { MicButton, ReadAloudBar, useDictationTarget, useReadAloud } from "@/components/speech";
import {
  DEMO_ARTICLE,
  DEMO_COPIED_SUMMARY,
  DEMO_KEYPOINTS,
  DEMO_LLM_GRADE,
  DEMO_OUTLINE,
  DEMO_SUMMARY,
} from "@/lib/demo";
import { COPY_THRESHOLD, computeScores } from "@/lib/rubric";
import type { Grade } from "@/lib/schemas";
import { rowsToTree, type OutlineRow } from "@/lib/outline";
import { countOutlineItems, ngramCopyRatio, suggestedSummaryRange } from "@/lib/textcheck";

const STEPS = ["開文章", "列大綱", "寫摘要", "看評分"] as const;

const RESULT_TIPS: { key: string; title: string; text: string }[] = [
  {
    key: "total",
    title: "總分與配分",
    text: "左邊是總分。右邊寫著這個年級的配分：國中大綱占 55、摘要 45；高中反過來重摘要（40 : 60）。在說明卡下方可以切換國中／高中配分，看同一份作答分數怎麼變。「重疊率」是摘要和原文相同字串的比例，超過 60% 會被當成照抄。",
  },
  {
    key: "criteria",
    title: "五個分項",
    text: "AI 老師對每一項只選等級：優、良、尚可、待加強，分數由系統依年級換算，所以同一標準對每位學生都一樣。每項下面的灰字是具體理由，會引用你寫的內容。",
  },
  { key: "strengths", title: "做得好的地方", text: "先看優點，知道哪些做法要保持。" },
  {
    key: "missed",
    title: "漏掉的重點",
    text: "這裡只給提示，不直接給答案。按「看 P5」會跳回原文並把那一段標黃，自己找出漏了什麼。",
  },
  { key: "errors", title: "和原文不符", text: "引用你寫的句子，指出哪裡和原文不一樣，並標出是哪一段。" },
  { key: "next", title: "下一步", text: "下次練習最值得改進的一件事，只有一句，照著做就好。" },
  {
    key: "reference",
    title: "參考答案",
    text: "中心思想、文章結構、白話大意和參考大綱。建議先依回饋自己修改、再評一次，最後才打開參考答案對照。",
  },
];

/** 捲動到目標區塊，並避開教練卡（桌機在上方、手機在下方） */
function scrollBelowCoach(el: Element) {
  const coach = document.querySelector(".coach");
  const rect = el.getBoundingClientRect();
  let top = window.scrollY + rect.top - 16;
  if (coach && getComputedStyle(coach).position === "sticky") top -= coach.getBoundingClientRect().height + 8;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

const hanCount = (s: string) => (s.match(/\p{Script=Han}/gu) || []).length;

export default function DemoPage() {
  const [step, setStep] = useState(0);
  const [grade, setGrade] = useState<Grade>("junior");
  const [hideArticle, setHideArticle] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [rows, setRows] = useState<OutlineRow[]>([{ text: "", level: 0 }]);
  const [summary, setSummary] = useState("");
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const dictSummary = useDictationTarget(() => summaryRef.current, setSummary);
  const [typing, setTyping] = useState(false);
  const [grading, setGrading] = useState(false);
  const [graded, setGraded] = useState(false);
  const [tip, setTip] = useState(0);
  const typingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const article = DEMO_ARTICLE;
  const reader = useReadAloud(article.paragraphs, article.title);
  const fullText = useMemo(() => article.paragraphs.map((p) => p.text).join(""), [article]);
  const summaryRange = suggestedSummaryRange(article.charCount);
  const filledRows = rows.filter((r) => r.text.trim()).length;
  const sumChars = hanCount(summary);
  const copyRatio = ngramCopyRatio(summary, fullText);

  useEffect(() => () => {
    if (typingTimer.current) clearInterval(typingTimer.current);
  }, []);

  // 切換步驟或提示時，把要看的區塊捲進畫面
  useEffect(() => {
    if (step === 0) return;
    const el =
      step === 3 && graded
        ? document.querySelector(`[data-tour="${RESULT_TIPS[tip].key}"]`)
        : document.getElementById(["reader", "outline-card", "summary-card", "submit-card"][step]);
    if (el) scrollBelowCoach(el);
  }, [step, tip, graded]);

  // ---- 大綱 ----
  const nextSampleIndex = DEMO_OUTLINE.findIndex((s) => !rows.some((r) => r.text === s.text));
  function addSampleRow() {
    if (nextSampleIndex === -1) return;
    const sample = DEMO_OUTLINE[nextSampleIndex];
    setRows((prev) => {
      const kept = prev.filter((r) => r.text.trim());
      return [...kept, { ...sample }];
    });
  }
  function fillAllRows() {
    setRows(DEMO_OUTLINE.map((r) => ({ ...r })));
  }

  // ---- 摘要 ----
  function typeSummary(text: string) {
    if (typingTimer.current) clearInterval(typingTimer.current);
    setTyping(true);
    setSummary("");
    let i = 0;
    typingTimer.current = setInterval(() => {
      i += 2;
      setSummary(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(typingTimer.current!);
        setTyping(false);
      }
    }, 40);
  }

  // ---- 評分 ----
  const result: AttemptResult | null = useMemo(() => {
    if (!graded) return null;
    const { items, total } = computeScores(DEMO_LLM_GRADE, grade, { copyRatio });
    const kpText = new Map(DEMO_KEYPOINTS.keyPoints.map((k) => [k.id, k.text]));
    return {
      attemptId: "demo",
      readSeconds: 0,
      total,
      items,
      copyRatio,
      keyPoints: DEMO_KEYPOINTS.keyPoints,
      keyPointsHit: DEMO_LLM_GRADE.keyPointsHit,
      keyPointsMissed: DEMO_LLM_GRADE.keyPointsMissed.map((m) => ({ ...m, text: kpText.get(m.id) })),
      errors: DEMO_LLM_GRADE.errors,
      strengths: DEMO_LLM_GRADE.strengths,
      nextStep: DEMO_LLM_GRADE.nextStep,
      reference: {
        centralIdea: DEMO_KEYPOINTS.centralIdea,
        structure: DEMO_KEYPOINTS.structure,
        vernacular: DEMO_KEYPOINTS.vernacular,
        outline: DEMO_KEYPOINTS.referenceOutline,
      },
      model: "示範（固定範例評語）",
      rubricVersion: "demo",
      usage: { tokensIn: 0, tokensOut: 0, latencyMs: 0 },
    };
  }, [graded, grade, copyRatio]);

  function submit() {
    setGrading(true);
    setTimeout(() => {
      setGrading(false);
      setGraded(true);
      setTip(0);
    }, 1400);
  }

  function jumpTo(pid?: string | null) {
    if (!pid) return;
    setHideArticle(false);
    setHighlight(pid);
    requestAnimationFrame(() => {
      const el = document.getElementById(`para-${pid}`);
      if (el) scrollBelowCoach(el);
    });
  }

  function goStep(n: number) {
    setStep(n);
    setHighlight(null);
  }

  const canNext = [true, countOutlineItems(rowsToTree(rows)) >= 3, sumChars >= 30 && !typing, false][step];

  // ---- 教練卡內容 ----
  let coach: React.ReactNode;
  if (step === 0) {
    coach = (
      <>
        <h2>步驟 1：開文章</h2>
        <p>
          系統會依年級抽一篇文章。示範用的是陶淵明〈桃花源記〉。先把文章讀完，注意三件事：
        </p>
        <ul>
          <li>每段前面的 <span className="pid">P1</span> 是段落編號，評分時會用它告訴你「回去看哪一段」。</li>
          <li>右上角「蓋起原文」可以把文章藏起來，練習憑記憶寫大綱。</li>
          <li>按「🔊 朗讀全文」可以用手機或電腦內建的語音聽文章；點段落編號可從那段開始讀。</li>
          <li>標題下方有朝代、作者、文體與字數；文言文的大綱和摘要要用白話寫。</li>
        </ul>
      </>
    );
  } else if (step === 1) {
    coach = (
      <>
        <h2>步驟 2：逐條加大綱</h2>
        <ul>
          <li>一行寫一個重點，按 <kbd>Enter</kbd> 新增下一條。</li>
          <li>按 <b>→</b>（或 <kbd>Tab</kbd>）把這條變成上一條的細項，<b>←</b> 退回上一層，最多 3 層。</li>
          <li>建議第一層寫「段落在做什麼」，第二層寫細節。</li>
          <li>每一條旁邊的 🎤 可以用說的輸入（瀏覽器會先問你能不能用麥克風）。</li>
        </ul>
        <div className="coach-actions">
          <button className="primary" onClick={addSampleRow} disabled={nextSampleIndex === -1}>
            {nextSampleIndex === -1 ? "範例都加完了" : `幫我加下一條（${nextSampleIndex + 1}/${DEMO_OUTLINE.length}）`}
          </button>
          <button className="ghost" onClick={fillAllRows}>
            一次填完
          </button>
        </div>
        <p className="muted small">也可以自己在大綱欄打字。至少 3 條才能進下一步（目前 {filledRows} 條）。</p>
      </>
    );
  } else if (step === 2) {
    coach = (
      <>
        <h2>步驟 3：寫摘要</h2>
        <ul>
          <li>用自己的話把整篇濃縮成一段，建議 {summaryRange[0]}–{summaryRange[1]} 字。</li>
          <li>第一句最好說出作者想表達什麼，再簡述經過。</li>
          <li>下方會即時顯示「與原文重疊率」，超過 60% 會被當成照抄。</li>
        </ul>
        <div className="coach-actions">
          <button className="primary" onClick={() => typeSummary(DEMO_SUMMARY)} disabled={typing}>
            幫我寫一段
          </button>
          <button className="ghost" onClick={() => typeSummary(DEMO_COPIED_SUMMARY)} disabled={typing}>
            示範：直接照抄會怎樣
          </button>
        </div>
      </>
    );
  } else if (!graded) {
    coach = (
      <>
        <h2>步驟 4：送出評分</h2>
        <p>按右邊的「送出評分」。正式使用時 AI 老師約 10–30 秒批改完；示範版用固定範例評語，一秒就好。</p>
      </>
    );
  } else {
    const t = RESULT_TIPS[tip];
    coach = (
      <>
        <h2>
          步驟 4：評分怎麼看（{tip + 1}/{RESULT_TIPS.length}）
        </h2>
        <h3>{t.title}</h3>
        <p>{t.text}</p>
        <div className="coach-actions">
          <button className="ghost" onClick={() => setTip((n) => Math.max(0, n - 1))} disabled={tip === 0}>
            上一個
          </button>
          {tip < RESULT_TIPS.length - 1 ? (
            <button className="primary" onClick={() => setTip((n) => n + 1)}>
              下一個
            </button>
          ) : (
            <Link className="primary as-button" href="/">
              示範結束，開始練習
            </Link>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="practice demo">
      <nav className="stepper" aria-label="示範步驟">
        {STEPS.map((s, i) => (
          <button
            key={s}
            className={i === step ? "on" : i < step ? "done" : ""}
            onClick={() => i <= step && goStep(i)}
            disabled={i > step}
          >
            <span className="n">{i + 1}</span>
            {s}
          </button>
        ))}
      </nav>

      <section className="coach card" aria-live="polite">
        {coach}
        <div className="coach-foot">
          {step > 0 && (
            <button className="ghost" onClick={() => goStep(step - 1)}>
              ← 上一步
            </button>
          )}
          {step < 3 && (
            <button className="primary" onClick={() => goStep(step + 1)} disabled={!canNext}>
              下一步：{STEPS[step + 1]} →
            </button>
          )}
          {step === 3 && graded && (
            <div className="seg small-seg" role="radiogroup" aria-label="用哪個年級計分">
              {(
                [
                  ["junior", "國中配分"],
                  ["senior", "高中配分"],
                ] as const
              ).map(([v, t]) => (
                <button key={v} role="radio" aria-checked={grade === v} className={grade === v ? "on" : ""} onClick={() => setGrade(v)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="work">
        <article id="reader" className={`reader card${step === 0 ? " spot" : ""}`}>
          <div className="reader-head">
            <div>
              <h1>{article.title}</h1>
              <p className="meta">
                {article.era}・{article.author}・{article.genre}・約 {article.charCount} 字
              </p>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={hideArticle} onChange={(e) => setHideArticle(e.target.checked)} />
              蓋起原文
            </label>
          </div>
          <ReadAloudBar ctl={reader} />
          {!hideArticle && (
            <div className="text">
              {article.paragraphs.map((p) => (
                <p
                  key={p.id}
                  id={`para-${p.id}`}
                  className={[highlight === p.id ? "hl" : "", reader.current === p.id ? "reading" : ""].join(" ")}
                >
                  {reader.supported ? (
                    <button type="button" className="pid" onClick={() => reader.play(p.id)} title={`從 ${p.id} 開始朗讀`}>
                      {p.id}
                    </button>
                  ) : (
                    <span className="pid">{p.id}</span>
                  )}
                  {p.text}
                </p>
              ))}
            </div>
          )}
          <p className="source">公有領域作品</p>
        </article>

        <section className="answer card">
          <div id="outline-card" className={`block${step === 1 ? " spot" : ""}`}>
            <h2>大綱</h2>
            <p className="hint">一行一個重點，用 → ← 調整層級（最多 3 層）。文言文請用白話寫。</p>
            {step >= 1 ? (
              <OutlineEditor rows={rows} onChange={setRows} />
            ) : (
              <p className="muted small">讀完文章後從這裡開始。</p>
            )}
          </div>

          <div id="summary-card" className={`block${step === 2 ? " spot" : ""}`}>
            <div className="field-head">
              <h2>摘要</h2>
              {step >= 2 && <MicButton onText={dictSummary} label="語音輸入摘要" />}
            </div>
            <p className="hint">
              用自己的話寫，建議 {summaryRange[0]}–{summaryRange[1]} 字。請用白話，不要整句照抄原文。
            </p>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={5}
              placeholder="這篇文章主要在說……"
              aria-label="摘要"
              disabled={step < 2}
            />
            <div className="meter-row">
              <span className={`count ${sumChars > summaryRange[1] ? "over" : ""}`}>{sumChars} 字</span>
              <span className={`copy-meter ${copyRatio > COPY_THRESHOLD ? "bad" : ""}`}>
                與原文重疊率 {Math.round(copyRatio * 100)}%
                <span className="bar">
                  <div style={{ width: `${Math.min(100, copyRatio * 100)}%` }} />
                  <i style={{ left: `${COPY_THRESHOLD * 100}%` }} />
                </span>
              </span>
            </div>
            {copyRatio > COPY_THRESHOLD && (
              <p className="error small">重疊率超過 60%，「精簡與轉述」會直接被評為待加強。試試改用自己的話。</p>
            )}
          </div>

          <div id="submit-card" className={`block${step === 3 && !graded ? " spot" : ""}`}>
            <button className="primary big" onClick={submit} disabled={step < 3 || grading}>
              {grading ? "老師批改中…" : graded ? "已評分（示範）" : "送出評分"}
            </button>
          </div>
        </section>
      </div>

      {result && (
        <ResultView
          result={result}
          history={[]}
          onJump={jumpTo}
          onNext={() => (window.location.href = "/")}
          nextLabel="開始正式練習"
          grade={grade}
          spot={RESULT_TIPS[tip].key}
          forceShowRef={RESULT_TIPS[tip].key === "reference"}
        />
      )}
    </div>
  );
}
