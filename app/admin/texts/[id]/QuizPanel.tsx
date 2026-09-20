"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { QUIZ_SKILLS, type Quiz, type QuizQuestion } from "@/lib/schemas";
import { fmtTime } from "../../AdminShell";

export type QuizInfo = { model: string; editedBy: string | null; createdAt: string; updatedAt: string; quiz: Quiz } | null;
const LETTERS = ["A", "B", "C", "D"];

/** 後台：檢查、修改、重新產生閱讀測驗題目（基礎模式） */
export function QuizPanel({
  articleId,
  initial,
  attempts,
  dirty,
}: {
  articleId: string;
  initial: QuizInfo;
  attempts: { count: number; avgCorrect: number | null };
  dirty: boolean;
}) {
  const [info, setInfo] = useState<QuizInfo>(initial);
  const [draft, setDraft] = useState<QuizQuestion[] | null>(null);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setInfo(initial), [initial]);

  async function generate() {
    if (dirty) return setMsg({ ok: false, text: "有未儲存的修改，請先儲存" });
    if (info && !window.confirm("重新出題會取代目前的題目（已作答的學生不受影響）。確定？")) return;
    setBusy("gen");
    setMsg(null);
    try {
      const r = await api<{ quiz: QuizInfo }>(`/api/admin/articles/${articleId}/quiz`, { method: "POST" });
      setInfo(r.quiz);
      setDraft(null);
      setMsg({ ok: true, text: "題目已產生，請逐題檢查" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy("save");
    setMsg(null);
    try {
      const r = await api<{ quiz: QuizInfo }>(`/api/admin/articles/${articleId}/quiz`, {
        method: "PUT",
        body: JSON.stringify({ questions: draft }),
      });
      setInfo(r.quiz);
      setDraft(null);
      setMsg({ ok: true, text: "題目已儲存" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const edit = (i: number, patch: Partial<QuizQuestion>) =>
    setDraft((d) => (d ? d.map((q, j) => (j === i ? { ...q, ...patch } : q)) : d));

  const shown = draft ?? info?.quiz.questions ?? [];

  return (
    <div className="panel">
      <h3>閱讀測驗題目（基礎模式）</h3>
      <p className="small muted">
        5 題四選一，一題 5 分。學生第一次用基礎模式開這篇時會自動出題；上架前建議先產生並檢查：答案唯一、依據在原文、錯誤選項不會太明顯。
        {attempts.count > 0 &&
          ` 已有 ${attempts.count} 人作答，平均答對 ${attempts.avgCorrect == null ? "—" : attempts.avgCorrect.toFixed(1)} 題。`}
      </p>

      {info ? (
        <ol className="kp-list quiz-admin">
          {shown.map((q, i) => (
            <li key={i}>
              {draft ? (
                <div className="quiz-edit">
                  <textarea rows={2} value={q.q} onChange={(e) => edit(i, { q: e.target.value })} aria-label={`第 ${i + 1} 題題幹`} />
                  {q.options.map((o, k) => (
                    <label key={k} className="quiz-edit-opt">
                      <input
                        type="radio"
                        name={`ans-${i}`}
                        checked={q.answer === k}
                        onChange={() => edit(i, { answer: k })}
                        title="設為正確答案"
                      />
                      <span>({LETTERS[k]})</span>
                      <input
                        value={o}
                        onChange={(e) => edit(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })}
                        aria-label={`第 ${i + 1} 題選項 ${LETTERS[k]}`}
                      />
                    </label>
                  ))}
                  <textarea
                    rows={2}
                    value={q.explanation}
                    onChange={(e) => edit(i, { explanation: e.target.value })}
                    aria-label={`第 ${i + 1} 題解析`}
                  />
                  <div className="row">
                    <input
                      value={q.paragraph ?? ""}
                      onChange={(e) => edit(i, { paragraph: e.target.value.trim() || null })}
                      placeholder="依據段落，如 P2"
                      style={{ width: 120 }}
                      aria-label="依據段落"
                    />
                    <select value={q.skill ?? ""} onChange={(e) => edit(i, { skill: (e.target.value || null) as QuizQuestion["skill"] })} aria-label="能力">
                      <option value="">（能力）</option>
                      {QUIZ_SKILLS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <b>{q.q}</b>
                  <ul className="plain small">
                    {q.options.map((o, k) => (
                      <li key={k} className={k === q.answer ? "lv-a" : ""}>
                        ({LETTERS[k]}) {o}
                        {k === q.answer && " ✓"}
                      </li>
                    ))}
                  </ul>
                  <p className="small muted">
                    {q.skill && `【${q.skill}】`}
                    {q.paragraph && `（${q.paragraph}）`}
                    {q.explanation}
                  </p>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">還沒出題。</p>
      )}
      {info && (
        <p className="small muted">
          模型：{info.model}・{fmtTime(info.createdAt)}
          {info.editedBy && `・${info.editedBy} 修改於 ${fmtTime(info.updatedAt)}`}
        </p>
      )}

      <div className="toolbar">
        {draft ? (
          <>
            <button className="primary sm" disabled={!!busy} onClick={save}>
              {busy === "save" ? "儲存中…" : "儲存題目"}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => setDraft(null)}>
              取消
            </button>
          </>
        ) : (
          <>
            <button className="btn" disabled={!!busy} onClick={generate}>
              {busy === "gen" ? "出題中…（約 10–30 秒）" : info ? "重新出題" : "產生題目"}
            </button>
            {info && (
              <button className="btn" disabled={!!busy} onClick={() => setDraft(structuredClone(info.quiz.questions))}>
                修改題目
              </button>
            )}
          </>
        )}
        {msg && <span className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
