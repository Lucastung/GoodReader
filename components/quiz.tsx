"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, getPref } from "@/lib/client";
import type { Article } from "@/lib/db";
import type { PublicQuestion, QuizResult } from "@/lib/quiz";
import { ArticleReader } from "./reader";
import { useReadAloud } from "./speech";
import { refreshUserMenu } from "./UserMenu";

const GRADE_COST = 2;
const LETTERS = ["A", "B", "C", "D"];

export type QuizSessionData = {
  sessionId: string;
  grade: "junior" | "senior";
  mode: "basic";
  article: Article;
  tokens: number;
  /** 還沒交卷：題目（不含答案）；交過卷為 null */
  questions: PublicQuestion[] | null;
  /** 交過卷：成績與解析 */
  quizResult: (QuizResult & { readSeconds?: number | null }) | null;
};

/** 基礎模式：讀文章 → 5 題選擇題 → 交卷看解析（每篇只能作答一次） */
export function QuizPractice({ initial }: { initial: QuizSessionData }) {
  const router = useRouter();
  const { sessionId, article, grade } = initial;
  const [tokens, setTokens] = useState(initial.tokens);
  const [result, setResult] = useState<QuizResult | null>(initial.quizResult);
  const questions = initial.questions;
  const [answers, setAnswers] = useState<(number | null)[]>(() => (questions ?? []).map(() => null));
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hideArticle, setHideArticle] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [nexting, setNexting] = useState(false);
  const reader = useReadAloud(article.paragraphs, article.title);
  const draftKey = `rd.quiz.${sessionId}`;

  useEffect(() => {
    setHideArticle(getPref("closedBook") === "1");
    try {
      const raw = localStorage.getItem(draftKey);
      const saved = raw ? (JSON.parse(raw) as (number | null)[]) : null;
      if (saved && questions && saved.length === questions.length) setAnswers(saved);
    } catch {
      /* 沒有草稿 */
    }
  }, [draftKey, questions]);

  function choose(i: number, k: number) {
    if (result) return;
    const next = answers.map((a, j) => (j === i ? k : a));
    setAnswers(next);
    setConfirming(false);
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      /* 忽略 */
    }
  }

  const jumpTo = useCallback((pid?: string | null) => {
    if (!pid) return;
    setHideArticle(false);
    setHighlight(pid);
    requestAnimationFrame(() => document.getElementById(`para-${pid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, []);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await api<QuizResult & { tokens: number }>(`/api/sessions/${sessionId}/quiz`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
      setResult(r);
      setTokens(r.tokens);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* 忽略 */
      }
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
      setConfirming(false);
      refreshUserMenu();
    }
  }

  async function nextArticle() {
    setNexting(true);
    setError(null);
    try {
      const r = await api<{ sessionId: string }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ grade, mode: "basic" }),
      });
      router.push(`/practice/${r.sessionId}`);
    } catch (e) {
      setError((e as Error).message);
      setNexting(false);
    }
  }

  const answered = answers.filter((a) => a != null).length;
  const items = result?.items ?? (questions ?? []).map((q) => ({ ...q, chosen: null as number | null }));

  return (
    <div className="practice">
      {initial.quizResult && (
        <p className="redo-note">✓ 你已經做過這篇的閱讀測驗（每篇只能作答一次）。下面是你的作答與解析。</p>
      )}
      <div className="work">
        <ArticleReader
          article={article}
          reader={reader}
          hideArticle={hideArticle}
          onHideChange={setHideArticle}
          highlight={highlight}
        />

        <section className="answer card quiz">
          {result ? (
            <div className="score-head">
              <div className="total">
                <span className="num">{result.score}</span>
                <span className="of">/ {result.max}</span>
              </div>
              <div className="muted small">
                答對 {result.correct} / {result.items.length} 題，一題 5 分
                <div>{result.correct === result.items.length ? "全對，太厲害了！" : "看看下面的解析，點「看 P?」回原文找依據。"}</div>
              </div>
            </div>
          ) : (
            <>
              <h2>閱讀測驗</h2>
              <p className="hint">讀完文章後回答 5 題選擇題，一題 5 分。每篇只能作答一次，交卷後就不能修改。</p>
            </>
          )}

          <ol className="quiz-list">
            {items.map((q, i) => {
              const done = result ? result.items[i] : null;
              const picked = done ? done.chosen : answers[i];
              return (
                <li key={i} className={done ? (done.correct ? "q-right" : "q-wrong") : ""}>
                  <p className="q-stem">
                    {done && <span className={`q-mark ${done.correct ? "lv-a" : "lv-d"}`}>{done.correct ? "○" : "✕"}</span>}
                    {q.q}
                  </p>
                  <div className="q-options" role="radiogroup" aria-label={`第 ${i + 1} 題`}>
                    {q.options.map((opt, k) => {
                      const cls = [
                        "q-opt",
                        picked === k ? "picked" : "",
                        done && k === done.answer ? "is-answer" : "",
                        done && picked === k && !done.correct ? "is-wrong" : "",
                      ].join(" ");
                      return (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={picked === k}
                          className={cls}
                          disabled={!!done || submitting}
                          onClick={() => choose(i, k)}
                        >
                          <span className="q-letter">({LETTERS[k]})</span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                  {done && (
                    <p className="q-explain">
                      <b>答案 ({LETTERS[done.answer]})</b>
                      {done.skill && <span className="q-skill">{done.skill}</span>}
                      {done.explanation}
                      {done.paragraph && (
                        <button className="link" onClick={() => jumpTo(done.paragraph)}>
                          看 {done.paragraph}
                        </button>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          {!result && questions && (
            <>
              {confirming ? (
                <div className="quiz-confirm">
                  <p className="small">交卷後不能修改，這篇也不能再作答。確定交卷嗎？</p>
                  <div className="row">
                    <button className="primary" onClick={submit} disabled={submitting}>
                      {submitting ? "批改中…" : `確定交卷（用 ${GRADE_COST} Token）`}
                    </button>
                    <button className="ghost" onClick={() => setConfirming(false)} disabled={submitting}>
                      再檢查一下
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="primary big"
                  onClick={() => setConfirming(true)}
                  disabled={answered < questions.length || tokens < GRADE_COST}
                >
                  {answered < questions.length
                    ? `還有 ${questions.length - answered} 題沒作答`
                    : `交卷（用 ${GRADE_COST} Token，剩 ${tokens}）`}
                </button>
              )}
            </>
          )}
          {error && <p className="error">{error}</p>}

          {result && (
            <div className="actions">
              <button className="primary" onClick={nextArticle} disabled={nexting}>
                {nexting ? "出題中…" : "換一篇"}
              </button>
              <a className="ghost as-button" href="/">
                回首頁
              </a>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
